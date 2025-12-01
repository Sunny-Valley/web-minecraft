'use client';

import { useEffect, useRef, useState } from 'react';

const Game = () => {
    const gameRef = useRef(null);
    const isMountedRef = useRef(false);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [hotbar, setHotbar] = useState('wall_wood');
    const [debugMsg, setDebugMsg] = useState('引擎初始化...');
    
    const inventoryRef = useRef(inventory);
    const hotbarRef = useRef(hotbar);

    useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
    useEffect(() => { hotbarRef.current = hotbar; }, [hotbar]);

    useEffect(() => {
        isMountedRef.current = true;

        const initGame = async () => {
            if (!isMountedRef.current || gameRef.current) return;

            const Phaser = (await import('phaser')).default;

            const config = {
                type: Phaser.AUTO,
                width: 800,
                height: 600,
                parent: 'phaser-game',
                backgroundColor: '#222', // 深灰背景，防止黑屏时太刺眼
                pixelArt: true,
                roundPixels: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    autoCenter: Phaser.Scale.CENTER_BOTH
                },
                physics: {
                    default: 'arcade',
                    arcade: { debug: false }
                },
                scene: { create: create, update: update } // 只需要 create 和 update
            };

            const game = new Phaser.Game(config);
            gameRef.current = game;

            let player, cursors, wasd;
            let ghostBlock;
            let objectsGroup, slimesGroup;
            const mapSize = 60;
            const tileSize = 16;

            function create() {
                try {
                    setDebugMsg('生成材质...');
                    const g = this.make.graphics({ add: false });
                    
                    // --- 1. 修复后的像素画绘制器 ---
                    const drawPixels = (key, colorMap, rows) => {
                        g.clear();
                        rows.forEach((row, y) => {
                            for (let x = 0; x < row.length; x++) {
                                const char = row[x];
                                const color = colorMap[char];
                                // 关键修复：严格检查颜色是否存在且不是 null
                                if (color !== undefined && color !== null) {
                                    g.fillStyle(color);
                                    g.fillRect(x, y, 1, 1);
                                }
                            }
                        });
                        g.generateTexture(key, 16, 16);
                    };

                    const C = {
                        _: null, 
                        g: 0x4CAF50, G: 0x2E7D32, // 草/深草
                        w: 0x4fc3f7, W: 0x0288d1, // 水
                        b: 0x795548, B: 0x3E2723, // 木
                        s: 0x9E9E9E, S: 0x616161, // 石
                        y: 0xFFEB3B, // 沙
                        p: 0xF48FB1, P: 0xAD1457, // 史莱姆
                        k: 0x000000, Y: 0xFFC107  // 黑/黄(玩家)
                    };

                    // 草地
                    drawPixels('t_grass', C, [
                        'gggggggggggggggg','ggGggggggggGgggg','gggggggggggggggg','ggggGggggggggggg',
                        'ggggggggggggGggg','gggggggggggggggg','ggGggggggggggggg','ggggggggGggggggg',
                        'gggggggggggggggg','gggggggggggggggg','gggggggggggggggg','gggggggggggggggg',
                        'gggggggggggggggg','gggggggggggggggg','gggggggggggggggg','gggggggggggggggg'
                    ]);
                    // 树木 (修复：确保透明色不被涂黑)
                    drawPixels('o_tree', C, [
                        '_______G________','______GGG_______','_____GGGGG______','____GGGGGGG_____',
                        '___GGGGGGGGG____','__GGGGGGGGGGG___','____GGGGGGG_____','_____GGGGG______',
                        '______BBB_______','______BBB_______','______BBB_______','______BBB_______',
                        '________________','________________','________________','________________'
                    ]);
                    // 石头
                    drawPixels('o_rock', C, [
                        '______sss_______','____sssssss_____','___ssSssssss____','___sSSssssss____',
                        '___sssssssss____','____sssssss_____','______sss_______','________________',
                        '________________','________________','________________','________________',
                        '________________','________________','________________','________________'
                    ]);
                    // 木墙
                    drawPixels('o_wall_wood', C, [
                        'BBBBBBBBBBBBBBBB','bBbBbBbBbBbBbBbB','bbbbbbbbbbbbbbbb','BBBBBBBBBBBBBBBB',
                        'bbbbbbbbbbbbbbbb','bBbBbBbBbBbBbBbB','bbbbbbbbbbbbbbbb','BBBBBBBBBBBBBBBB',
                        'bbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbb',
                        'bbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbb','bbbbbbbbbbbbbbbb'
                    ]);
                    // 史莱姆
                    drawPixels('m_slime', C, [
                        '________________','________________','______pppp______','____pppppppp____',
                        '___pppppppppp___','___pKp____pKp___','___pppppppppp___','____pppppppp____',
                        '________________','________________','________________','________________',
                        '________________','________________','________________','________________'
                    ]);
                    // 玩家
                    drawPixels('player', C, [
                        '________________','____YYYYYYYY____','____YYYYYYYY____','____YYYYYYYY____',
                        '____YKYYYYKY____','____YYYYYYYY____','____YYYYYYYY____','____YYYYYYYY____',
                        '________________','________________','________________','________________',
                        '________________','________________','________________','________________'
                    ]);

                    g.clear(); g.fillStyle(C.w); g.fillRect(0,0,16,16); g.generateTexture('t_water', 16, 16);
                    g.clear(); g.fillStyle(C.y); g.fillRect(0,0,16,16); g.generateTexture('t_sand', 16, 16);

                    // --- 2. 构建地图 ---
                    setDebugMsg('生成地形...');
                    objectsGroup = this.physics.add.group({ immovable: true });
                    slimesGroup = this.physics.add.group();

                    const noise = (x, y) => Math.sin(x*0.15) + Math.cos(y*0.15);

                    for(let y=0; y<mapSize; y++) {
                        for(let x=0; x<mapSize; x++) {
                            const px = x * tileSize;
                            const py = y * tileSize;
                            const n = noise(x, y) + Math.random()*0.1;

                            if (n < -0.6) {
                                const water = this.add.image(px, py, 't_water').setOrigin(0);
                                this.physics.add.existing(water, true);
                                objectsGroup.add(water);
                                water.setData('type', 'water');
                            } else if (n < -0.4) {
                                this.add.image(px, py, 't_sand').setOrigin(0);
                            } else {
                                this.add.image(px, py, 't_grass').setOrigin(0);
                                const r = Math.random();
                                if (r < 0.05) {
                                    const tree = objectsGroup.create(px+8, py+8, 'o_tree');
                                    tree.body.setSize(10, 10);
                                    tree.setData('type', 'tree');
                                } else if (r < 0.07) {
                                    const rock = objectsGroup.create(px+8, py+8, 'o_rock');
                                    rock.body.setSize(10, 10);
                                    rock.setData('type', 'rock');
                                } else if (r < 0.08) {
                                    const slime = slimesGroup.create(px+8, py+8, 'm_slime');
                                    slime.setBounce(1);
                                    slime.setCollideWorldBounds(true);
                                }
                            }
                        }
                    }

                    // --- 3. 玩家与控制 ---
                    player = this.physics.add.sprite(mapSize*tileSize/2, mapSize*tileSize/2, 'player');
                    player.setCollideWorldBounds(true);
                    player.setDepth(10);

                    this.physics.world.setBounds(0, 0, mapSize*tileSize, mapSize*tileSize);
                    this.cameras.main.startFollow(player, true);
                    this.cameras.main.setZoom(2.5);

                    this.physics.add.collider(player, objectsGroup);
                    this.physics.add.collider(slimesGroup, objectsGroup);
                    // 修复报错关键点：使用 collide 回调而不是 iterate
                    this.physics.add.collider(player, slimesGroup, (p, s) => {
                         // 简单的反弹逻辑
                         if(s.body.touching.up) s.setVelocityY(50);
                         else if(s.body.touching.down) s.setVelocityY(-50);
                    });

                    ghostBlock = this.add.image(0, 0, 'o_wall_wood').setAlpha(0.6).setDepth(20);

                    cursors = this.input.keyboard.createCursorKeys();
                    wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68, e:69});
                    this.input.on('pointerdown', (pointer) => handleInput(this, pointer));

                    // --- 修复报错关键点：安全循环 ---
                    // 不再使用 iterate，而是用原生的 getChildren().forEach
                    this.time.addEvent({
                        delay: 1500, loop: true,
                        callback: () => {
                            const slimes = slimesGroup.getChildren();
                            if (slimes && slimes.length > 0) {
                                slimes.forEach(s => {
                                    if(s && s.body) { // 确保对象还活着
                                        s.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(-40, 40));
                                    }
                                });
                            }
                        }
                    });

                    setDebugMsg('✅ 就绪! WASD移动 左键破坏 右键建造');

                } catch (err) {
                    console.error(err);
                    setDebugMsg(`❌ 错误: ${err.message}`);
                }
            }

            function update() {
                if (!player) return;

                player.body.setVelocity(0);
                const speed = 120;
                if (cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                else if (cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                
                if (cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                else if (cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                if (Phaser.Input.Keyboard.JustDown(wasd.e)) {
                    setHotbar(prev => prev === 'wall_wood' ? 'wall_rock' : 'wall_wood');
                }

                const wp = this.input.activePointer.positionToCamera(this.cameras.main);
                const tx = Math.floor(wp.x / 16) * 16 + 8;
                const ty = Math.floor(wp.y / 16) * 16 + 8;
                ghostBlock.x = tx; ghostBlock.y = ty;
                
                ghostBlock.setTexture(hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock');
                ghostBlock.setTint(inventoryRef.current.wood > 0 ? 0xffffff : 0xff0000);
            }

            function handleInput(scene, pointer) {
                const wp = pointer.positionToCamera(scene.cameras.main);
                // 修复：使用 getChildren() 确保兼容性
                const clickedObj = objectsGroup.getChildren().find(o => 
                    Phaser.Geom.Rectangle.Contains(o.getBounds(), wp.x, wp.y)
                );

                if (pointer.leftButtonDown()) {
                    if (clickedObj) {
                        const type = clickedObj.getData('type');
                        if(type === 'water') return;
                        
                        // 销毁特效
                        const p = scene.add.rectangle(clickedObj.x, clickedObj.y, 8, 8, 0xFFFFFF);
                        scene.tweens.add({targets:p, scale:0, duration:200, onComplete:()=>p.destroy()});
                        
                        clickedObj.destroy();
                        setInventory(prev => {
                            const n = {...prev};
                            if(type==='tree'||type==='wall') n.wood++;
                            else if(type==='rock') n.stone++;
                            return n;
                        });
                    }
                } else if (pointer.rightButtonDown()) {
                    if (!clickedObj && inventoryRef.current.wood > 0) {
                        const tx = Math.floor(wp.x / 16) * 16 + 8;
                        const ty = Math.floor(wp.y / 16) * 16 + 8;
                        if (Phaser.Math.Distance.Between(player.x, player.y, tx, ty) < 12) return;

                        const type = hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock';
                        const wall = objectsGroup.create(tx, ty, type);
                        wall.body.setImmovable(true);
                        wall.setData('type', 'wall');
                        setInventory(prev => ({...prev, wood: prev.wood-1}));
                    }
                }
            }
        };

        initGame();

        return () => {
            isMountedRef.current = false;
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []);

    const saveGame = async () => {
        setDebugMsg('上传中...');
        try {
            await fetch('/api/save', { method: 'POST', body: JSON.stringify(inventory) });
            setDebugMsg('✅ 存档成功');
        } catch (e) { setDebugMsg('❌ 失败'); }
    };

    return (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
            <div style={{ flex: 1, position: 'relative' }}>
                <div id="phaser-game" style={{ width: '100%', height: '100%' }}></div>
                <div style={{ position: 'absolute', top: 10, left: 10, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '5px' }}>
                    {debugMsg}
                </div>
            </div>
            
            <div style={{ width: '220px', background: '#222', padding: '20px', color: '#eee', borderLeft: '2px solid #444' }}>
                <h3>🎒 背包</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '20px 0' }}>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center' }}>
                        <div>🪵</div><b>{inventory.wood}</b>
                    </div>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center' }}>
                        <div>🪨</div><b>{inventory.stone}</b>
                    </div>
                </div>
                <div style={{ marginTop: 'auto', background: '#333', padding: '10px' }}>
                    <div>当前: {hotbar === 'wall_wood' ? '木墙' : '石墙'}</div>
                    <small>(按 E 切换)</small>
                </div>
                <button onClick={saveGame} style={{ marginTop: '20px', width: '100%', padding: '10px', background: '#0070f3', color: 'white', border: 'none', cursor: 'pointer' }}>
                    保存进度
                </button>
            </div>
        </div>
    );
};

export default Game;