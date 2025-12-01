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

            // 动态导入 Phaser
            const Phaser = (await import('phaser')).default;

            const config = {
                type: Phaser.AUTO,
                width: 800,
                height: 600,
                parent: 'phaser-game',
                backgroundColor: '#111',
                pixelArt: true, // 关键：像素完美模式
                roundPixels: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    autoCenter: Phaser.Scale.CENTER_BOTH
                },
                physics: {
                    default: 'arcade',
                    arcade: { debug: false }
                },
                scene: { preload: preload, create: create, update: update }
            };

            const game = new Phaser.Game(config);
            gameRef.current = game;

            // --- 游戏全局变量 ---
            let player, cursors, wasd;
            let ghostBlock;
            let objectsGroup, decorGroup, slimesGroup;
            const mapSize = 60; // 地图大小
            const tileSize = 16; // 16x16 像素

            // --- 1. 预加载 (留空，我们用程序生成) ---
            function preload() {
                // 可以在这里加载外部图片，但我们这次全靠代码画
            }

            // --- 2. 创建世界 (核心逻辑) ---
            function create() {
                try {
                    setDebugMsg('正在生成材质...');
                    
                    // --- A. 纹理生成器 (放在 create 里更安全) ---
                    const g = this.make.graphics({ add: false });
                    
                    // 辅助画点函数
                    const drawPixels = (key, colorMap, rows) => {
                        g.clear();
                        rows.forEach((row, y) => {
                            for (let x = 0; x < row.length; x++) {
                                const color = colorMap[row[x]];
                                if (color !== undefined) {
                                    g.fillStyle(color);
                                    g.fillRect(x, y, 1, 1); // 1x1 像素绘制
                                }
                            }
                        });
                        g.generateTexture(key, 16, 16);
                    };

                    // 定义调色板
                    const C = {
                        _: null, // 透明
                        g: 0x4CAF50, G: 0x2E7D32, // 草/深草
                        w: 0x4fc3f7, W: 0x0288d1, // 浅水/深水
                        b: 0x795548, B: 0x3E2723, // 木/深木
                        s: 0x9E9E9E, S: 0x616161, // 石/深石
                        y: 0xFFEB3B, // 沙
                        r: 0xE91E63, // 花红
                        p: 0xF48FB1, P: 0xAD1457 // 史莱姆粉/深粉
                    };

                    // 1. 草地
                    drawPixels('t_grass', C, [
                        'gggggggggggggggg',
                        'ggGggggggggGgggg',
                        'gggggggggggggggg',
                        'ggggGggggggggggg',
                        'ggggggggggggGggg',
                        'gggggggggggggggg',
                        'ggGggggggggggggg',
                        'ggggggggGggggggg',
                        'gggggggggggggggg', // 重复填满 16 行
                        'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg',
                        'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg'
                    ]);

                    // 2. 树木
                    drawPixels('o_tree', C, [
                        '_____GGG________',
                        '____GGGGG_______',
                        '___GGGGGGG______',
                        '___GGGGGGG______',
                        '____GGGGG_______',
                        '_____BBB________',
                        '_____BBB________',
                        '_____BBB________',
                        '_____BBB________', // 树干
                        '________________', '________________', '________________',
                        '________________', '________________', '________________', '________________'
                    ]);

                    // 3. 石头
                    drawPixels('o_rock', C, [
                        '______sss_______',
                        '____sssssss_____',
                        '___ssSssssss____',
                        '___sSSssssss____',
                        '___sssssssss____',
                        '____sssssss_____',
                        '______sss_______',
                        '________________',
                        '________________', '________________', '________________', '________________',
                        '________________', '________________', '________________', '________________'
                    ]);

                    // 4. 木墙
                    drawPixels('o_wall_wood', C, [
                        'BBBBBBBBBBBBBBBB',
                        'bBbBbBbBbBbBbBbB',
                        'bbbbbbbbbbbbbbbb',
                        'BBBBBBBBBBBBBBBB',
                        'bbbbbbbbbbbbbbbb',
                        'bBbBbBbBbBbBbBbB',
                        'bbbbbbbbbbbbbbbb',
                        'BBBBBBBBBBBBBBBB',
                        'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb',
                        'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb'
                    ]);

                    // 5. 史莱姆
                    drawPixels('m_slime', C, [
                        '________________',
                        '________________',
                        '______pppp______',
                        '____pppppppp____',
                        '___pppppppppp___',
                        '___pPp____pPp___', // 眼睛
                        '___pppppppppp___',
                        '____pppppppp____',
                        '________________', '________________', '________________', '________________',
                        '________________', '________________', '________________', '________________'
                    ]);

                    // 补全简单纹理
                    g.clear(); g.fillStyle(C.w); g.fillRect(0,0,16,16); g.generateTexture('t_water', 16, 16);
                    g.clear(); g.fillStyle(C.y); g.fillRect(0,0,16,16); g.generateTexture('t_sand', 16, 16);
                    
                    // 玩家
                    g.clear(); 
                    g.fillStyle(0xFFC107); g.fillRect(4,4,8,8); 
                    g.fillStyle(0x000000); g.fillRect(5,5,2,2); g.fillRect(9,5,2,2);
                    g.generateTexture('player', 16, 16);


                    // --- B. 地图生成 ---
                    setDebugMsg('正在构建地形...');
                    
                    // 物理组
                    objectsGroup = this.physics.add.group({ immovable: true });
                    decorGroup = this.add.group();
                    slimesGroup = this.physics.add.group();

                    const noise = (x, y) => Math.sin(x*0.15) + Math.cos(y*0.15) + Math.random()*0.1;

                    for(let y=0; y<mapSize; y++) {
                        for(let x=0; x<mapSize; x++) {
                            const px = x * tileSize;
                            const py = y * tileSize;
                            const n = noise(x, y);

                            if (n < -0.5) {
                                // 水
                                const water = this.add.image(px, py, 't_water').setOrigin(0);
                                this.physics.add.existing(water, true);
                                objectsGroup.add(water);
                                water.setData('type', 'water');
                            } else if (n < -0.3) {
                                // 沙滩
                                this.add.image(px, py, 't_sand').setOrigin(0);
                            } else {
                                // 草地
                                this.add.image(px, py, 't_grass').setOrigin(0);
                                
                                // 生成物体
                                const rand = Math.random();
                                if (rand < 0.05) {
                                    // 树 (中心点修正 +8)
                                    const tree = objectsGroup.create(px+8, py+8, 'o_tree');
                                    tree.body.setSize(10, 10);
                                    tree.setData('type', 'tree');
                                } else if (rand < 0.07) {
                                    // 石
                                    const rock = objectsGroup.create(px+8, py+8, 'o_rock');
                                    rock.body.setSize(10, 10);
                                    rock.setData('type', 'rock');
                                } else if (rand < 0.08) {
                                    // 史莱姆
                                    const slime = slimesGroup.create(px+8, py+8, 'm_slime');
                                    slime.setBounce(1);
                                    slime.setCollideWorldBounds(true);
                                }
                            }
                        }
                    }

                    // --- C. 玩家与控制 ---
                    player = this.physics.add.sprite(mapSize*tileSize/2, mapSize*tileSize/2, 'player');
                    player.setCollideWorldBounds(true);
                    player.setDepth(10);
                    
                    // 摄像机
                    this.physics.world.setBounds(0, 0, mapSize*tileSize, mapSize*tileSize);
                    this.cameras.main.startFollow(player, true);
                    this.cameras.main.setZoom(2.5); // 适度缩放

                    // 碰撞
                    this.physics.add.collider(player, objectsGroup);
                    this.physics.add.collider(slimesGroup, objectsGroup);
                    this.physics.add.collider(player, slimesGroup, (p, s) => {
                        const angle = Phaser.Math.Angle.Between(s.x, s.y, p.x, p.y);
                        p.setVelocity(Math.cos(angle)*200, Math.sin(angle)*200);
                    });

                    // 预览块
                    ghostBlock = this.add.image(0, 0, 'o_wall_wood').setAlpha(0.6).setDepth(20);

                    // 输入
                    cursors = this.input.keyboard.createCursorKeys();
                    wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68, e:69});
                    this.input.on('pointerdown', (pointer) => handleInput(this, pointer));

                    // 史莱姆 AI
                    this.time.addEvent({
                        delay: 1500, loop: true,
                        callback: () => slimesGroup.children.iterate(s => {
                            if(s) s.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(-40, 40));
                        })
                    });

                    setDebugMsg('✅ 游戏就绪! 移动:WASD 建造:右键');

                } catch (err) {
                    console.error(err);
                    setDebugMsg(`❌ 崩溃: ${err.message}`);
                }
            }

            function update() {
                if (!player) return;

                // 移动
                player.body.setVelocity(0);
                const speed = 120;
                if (cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                else if (cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                
                if (cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                else if (cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                // 切换物品
                if (Phaser.Input.Keyboard.JustDown(wasd.e)) {
                    setHotbar(prev => prev === 'wall_wood' ? 'wall_rock' : 'wall_wood');
                }

                // 幽灵方块逻辑
                const wp = this.input.activePointer.positionToCamera(this.cameras.main);
                const tx = Math.floor(wp.x / 16) * 16 + 8;
                const ty = Math.floor(wp.y / 16) * 16 + 8;
                
                ghostBlock.x = tx; 
                ghostBlock.y = ty;
                
                const canBuild = inventoryRef.current.wood > 0;
                ghostBlock.setTint(canBuild ? 0xffffff : 0xff0000);
                ghostBlock.setTexture(hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock');
            }

            function handleInput(scene, pointer) {
                const wp = pointer.positionToCamera(scene.cameras.main);
                // 查找点击的物理对象
                const clickedObj = objectsGroup.getChildren().find(o => 
                    Phaser.Geom.Rectangle.Contains(o.getBounds(), wp.x, wp.y)
                );

                if (pointer.leftButtonDown()) {
                    // 破坏
                    if (clickedObj) {
                        const type = clickedObj.getData('type');
                        if(type === 'water') return;

                        // 简单的粒子
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
                    // 建造
                    if (!clickedObj && inventoryRef.current.wood > 0) {
                        const tx = Math.floor(wp.x / 16) * 16 + 8;
                        const ty = Math.floor(wp.y / 16) * 16 + 8;

                        // 简单防卡死：不能在自己脚下建
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