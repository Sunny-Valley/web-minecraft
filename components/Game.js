'use client';

import { useEffect, useRef, useState } from 'react';

const Game = () => {
    const gameRef = useRef(null);
    const isMountedRef = useRef(false);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [hotbar, setHotbar] = useState('wall_wood');
    const [debugMsg, setDebugMsg] = useState('初始化单色引擎...');
    
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
                backgroundColor: '#111', // 深黑背景
                pixelArt: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    autoCenter: Phaser.Scale.CENTER_BOTH
                },
                physics: {
                    default: 'arcade',
                    arcade: { debug: false }
                },
                scene: { create: create, update: update }
            };

            const game = new Phaser.Game(config);
            gameRef.current = game;

            let player, cursors, wasd;
            let ghostBlock;
            let waterGroup, obstaclesGroup, slimesGroup;
            const mapSize = 80; // 地图更大
            const tileSize = 16;

            function create() {
                try {
                    setDebugMsg('生成黑白材质...');
                    const g = this.make.graphics({ add: false });
                    
                    // --- 1. 黑白灰纹理生成器 ---
                    const drawPixels = (key, colorMap, rows) => {
                        g.clear();
                        for (let y = 0; y < rows.length; y++) {
                            const row = rows[y];
                            for (let x = 0; x < row.length; x++) {
                                const char = row.charAt(x); 
                                const color = colorMap[char];
                                if (color !== undefined && color !== null) {
                                    g.fillStyle(color);
                                    g.fillRect(x, y, 1, 1);
                                }
                            }
                        }
                        g.generateTexture(key, 16, 16);
                    };

                    // 🖤 高级灰调色板
                    const P = {
                        _: null, 
                        B: 0x000000, // 纯黑 (轮廓/深渊)
                        D: 0x333333, // 深灰 (石头/阴影/树干)
                        M: 0x666666, // 中灰 (地面/山体)
                        L: 0x999999, // 浅灰 (草地/树叶)
                        S: 0xCCCCCC, // 银白 (沙子/高光)
                        W: 0xFFFFFF  // 纯白 (极致高光/雪/玩家)
                    };

                    // 纹理定义 (通过灰度差异表现质感)
                    
                    // 地形：草地 (由于是黑白，用噪点表现质感)
                    drawPixels('t_grass', P, [
                        'MMMMMMMMMMMMMMMM','MMMLMMMMMMMMLMMM','MMMMMMMMMMMMMMMM','MMMMMMMLMMMMMMMM',
                        'MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM','MMMLMMMMMMMMMMMM','MMMMMMMMMMMMMMMM',
                        'MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM',
                        'MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM','MMMMMMMMMMMMMMMM'
                    ]);
                    // 地形：沙地 (更亮，平滑)
                    g.clear(); g.fillStyle(P.S); g.fillRect(0,0,16,16); 
                    g.fillStyle(P.L); g.fillRect(3,3,2,2); g.fillRect(10,12,2,2); // 沙砾感
                    g.generateTexture('t_sand', 16, 16);

                    // 地形：深水 (深色，带流动波纹)
                    drawPixels('t_water', P, [
                        'DDDDDDDDDDDDDDDD','DDDDDDWDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDW',
                        'DDDDDDDDDDDDDDDD','DDWDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD',
                        'DDDDDDDDDDDDDDDD','DDDDDDDDWDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD',
                        'DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD'
                    ]);
                    
                    // 地形：山地 (崎岖的岩石地面)
                    drawPixels('t_mountain', P, [
                        'DDDDDDDDDDDDDDDD','DDDMMMMDDDDMMMDD','DDMMMMMMDDMMMMMM','DDMMMMMMDDMMMMMM',
                        'DDDDMMMDDDDDDMMM','DDDDDDDDDDDDDDDD','DDMMMDDDDDDDDMMM','DMMMMMMDDDDMMMMM',
                        'DMMMMMMDDDDMMMMM','DDMMMDDDDDDDDMMM','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD',
                        'DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD'
                    ]);

                    // 物体：树 (黑白风)
                    drawPixels('o_tree', P, [
                        '_______L________','______LLL_______','_____LLLLL______','____LLLLLLL_____',
                        '___LLLLLLLLL____','__LLLLLLLLLLL___','____LLLLLLL_____','_____LLLLL______',
                        '______DDD_______','______DDD_______','______DDD_______','______DDD_______',
                        '______DDD_______','________________','________________','________________'
                    ]);

                    // 物体：仙人掌 (沙漠专属)
                    drawPixels('o_cactus', P, [
                        '________________','______DDD_______','__D___DDD_______','__D___DDD___D___',
                        '__D___DDD___D___','__DDDDDDD___D___','____DDDDD___D___','______DDDDDDD___',
                        '______DDD_______','______DDD_______','______DDD_______','______DDD_______',
                        '______DDD_______','________________','________________','________________'
                    ]);

                    // 物体：岩石
                    drawPixels('o_rock', P, [
                        '______LLL_______','____LLLLLLL_____','___LLLLLLLLL____','___LLDDDLLLL____',
                        '___LLLLLLLLL____','____LLLLLLL_____','______LLL_______','________________',
                        '________________','________________','________________','________________',
                        '________________','________________','________________','________________'
                    ]);

                    // 物体：墙
                    drawPixels('o_wall_wood', P, [
                        'DDDDDDDDDDDDDDDD','DMDMDMDMDMDMDMDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD',
                        'DMDMDMDMDMDMDMDD','DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DMDMDMDMDMDMDMDD',
                        'DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DMDMDMDMDMDMDMDD','DDDDDDDDDDDDDDDD',
                        'DDDDDDDDDDDDDDDD','DDDDDDDDDDDDDDDD','DMDMDMDMDMDMDMDD','DDDDDDDDDDDDDDDD'
                    ]);

                    // 生物：史莱姆 (高亮白，体现粘液感)
                    drawPixels('m_slime', P, [
                        '________________','________________','______WWWW______','____WWWWWWWW____',
                        '___WWWWWWWWWW___','___WBW____WBW___','___WWWWWWWWWW___','____WWWWWWWW____',
                        '________________','________________','________________','________________',
                        '________________','________________','________________','________________'
                    ]);

                    // 玩家 (极简高对比度 - 黑色身体白色眼睛)
                    drawPixels('player', P, [
                        '________________','____BBBBBBBB____','____BBBBBBBB____','____BBBBBBBB____',
                        '____BWBWWWBW____','____BBBBBBBB____','____BBBBBBBB____','____BBBBBBBB____',
                        '________________','________________','________________','________________',
                        '________________','________________','________________','________________'
                    ]);


                    // --- 2. 生物群系生成 (Biomes) ---
                    setDebugMsg('生成复杂地形...');
                    
                    waterGroup = this.physics.add.staticGroup();
                    obstaclesGroup = this.physics.add.group({ immovable: true });
                    slimesGroup = this.physics.add.group();

                    const safeSpawns = [];

                    // 使用两个噪声：
                    // n1: 海拔 (Height) -> 决定水、平原、山地
                    // n2: 湿度 (Moisture) -> 决定沙漠、森林
                    const noise = (x, y) => Math.sin(x*0.1) + Math.cos(y*0.1); 
                    // 简单的伪随机噪声偏移
                    const noiseMoisture = (x, y) => Math.cos(x*0.15) + Math.sin(y*0.15);

                    for(let y=0; y<mapSize; y++) {
                        for(let x=0; x<mapSize; x++) {
                            const px = x * tileSize;
                            const py = y * tileSize;
                            
                            // 叠加一点随机数让边缘自然
                            const height = noise(x, y) + Math.random()*0.1;
                            const moisture = noiseMoisture(x, y) + Math.random()*0.1;

                            // --- 地形判定逻辑 ---
                            let isLand = true;

                            if (height < -0.5) {
                                // 🌊 深水区
                                waterGroup.create(px, py, 't_water').setOrigin(0).refreshBody();
                                isLand = false;
                            } else if (height > 0.8) {
                                // 🏔️ 高山区 (灰色岩石地)
                                this.add.image(px, py, 't_mountain').setOrigin(0);
                                // 山上多石头
                                if (Math.random() < 0.1) {
                                    const rock = obstaclesGroup.create(px+8, py+8, 'o_rock');
                                    rock.body.setSize(10, 10);
                                    rock.setData('type', 'rock');
                                    isLand = false;
                                }
                            } else {
                                // 陆地：根据湿度决定类型
                                if (moisture < -0.5) {
                                    // 🌵 沙漠 (干燥)
                                    this.add.image(px, py, 't_sand').setOrigin(0);
                                    if (Math.random() < 0.05) {
                                        // 生成仙人掌 (也是木头来源)
                                        const cactus = obstaclesGroup.create(px+8, py+8, 'o_cactus');
                                        cactus.body.setSize(8, 14);
                                        cactus.setData('type', 'tree'); // 逻辑上算树
                                        isLand = false;
                                    }
                                } else if (moisture > 0.3) {
                                    // 🌲 森林 (湿润)
                                    this.add.image(px, py, 't_grass').setOrigin(0);
                                    if (Math.random() < 0.15) { // 树很密
                                        const tree = obstaclesGroup.create(px+8, py+8, 'o_tree');
                                        tree.body.setSize(10, 10);
                                        tree.setData('type', 'tree');
                                        isLand = false;
                                    }
                                } else {
                                    // 🌱 平原 (普通)
                                    this.add.image(px, py, 't_grass').setOrigin(0);
                                    const r = Math.random();
                                    if (r < 0.02) { // 树稀疏
                                        const tree = obstaclesGroup.create(px+8, py+8, 'o_tree');
                                        tree.body.setSize(10, 10);
                                        tree.setData('type', 'tree');
                                        isLand = false;
                                    } else if (r < 0.03) {
                                        const rock = obstaclesGroup.create(px+8, py+8, 'o_rock');
                                        rock.body.setSize(10, 10);
                                        rock.setData('type', 'rock');
                                        isLand = false;
                                    } else if (r < 0.04) {
                                        const slime = slimesGroup.create(px+8, py+8, 'm_slime');
                                        slime.setBounce(1);
                                        slime.setCollideWorldBounds(true);
                                    }
                                }
                            }

                            if(isLand) safeSpawns.push({x: px + 8, y: py + 8});
                        }
                    }

                    // --- 3. 玩家出生 ---
                    let spawnX = mapSize*tileSize/2, spawnY = mapSize*tileSize/2;
                    if (safeSpawns.length > 0) {
                        const spot = safeSpawns[Math.floor(safeSpawns.length / 2)];
                        spawnX = spot.x; spawnY = spot.y;
                    }

                    player = this.physics.add.sprite(spawnX, spawnY, 'player');
                    player.setCollideWorldBounds(true);
                    player.setDepth(20);
                    player.body.setSize(12, 12);

                    this.physics.world.setBounds(0, 0, mapSize*tileSize, mapSize*tileSize);
                    this.cameras.main.startFollow(player, true);
                    this.cameras.main.setZoom(2.5);

                    // 碰撞
                    this.physics.add.collider(player, waterGroup);
                    this.physics.add.collider(player, obstaclesGroup);
                    this.physics.add.collider(slimesGroup, waterGroup);
                    this.physics.add.collider(slimesGroup, obstaclesGroup);
                    this.physics.add.collider(player, slimesGroup, (p, s) => {
                         const angle = Phaser.Math.Angle.Between(s.x, s.y, p.x, p.y);
                         p.setVelocity(Math.cos(angle)*100, Math.sin(angle)*100);
                    });

                    ghostBlock = this.add.image(0, 0, 'o_wall_wood').setAlpha(0.6).setDepth(30);

                    cursors = this.input.keyboard.createCursorKeys();
                    wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68, e:69});
                    this.input.on('pointerdown', (pointer) => {
                        window.focus();
                        handleInput(this, pointer);
                    });

                    // AI
                    this.time.addEvent({
                        delay: 1500, loop: true,
                        callback: () => {
                            const slimes = slimesGroup.getChildren();
                            if (slimes.length > 0) {
                                slimes.forEach(s => {
                                    if(s.body) s.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(-40, 40));
                                });
                            }
                        }
                    });

                    setDebugMsg('✅ 游戏就绪 (黑白写实版)');

                } catch (err) {
                    console.error(err);
                    setDebugMsg(`❌ 错误: ${err.message}`);
                }
            }

            function update() {
                if (!player) return;

                player.body.setVelocity(0);
                const speed = 120;
                
                if (cursors && wasd) {
                    if (cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                    else if (cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                    
                    if (cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                    else if (cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                    if (Phaser.Input.Keyboard.JustDown(wasd.e)) {
                        setHotbar(prev => prev === 'wall_wood' ? 'wall_rock' : 'wall_wood');
                    }
                }

                const wp = this.input.activePointer.positionToCamera(this.cameras.main);
                const tx = Math.floor(wp.x / 16) * 16 + 8;
                const ty = Math.floor(wp.y / 16) * 16 + 8;
                ghostBlock.x = tx; ghostBlock.y = ty;
                
                ghostBlock.setTexture(hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock');
                ghostBlock.setTint(inventoryRef.current.wood > 0 ? 0xffffff : 0x333333); // 黑白风：用深灰表示不可用
            }

            function handleInput(scene, pointer) {
                const wp = pointer.positionToCamera(scene.cameras.main);
                let clickedObj = obstaclesGroup.getChildren().find(o => 
                    Phaser.Geom.Rectangle.Contains(o.getBounds(), wp.x, wp.y)
                );

                if (pointer.leftButtonDown()) {
                    if (clickedObj) {
                        const type = clickedObj.getData('type');
                        
                        const p = scene.add.rectangle(clickedObj.x, clickedObj.y, 8, 8, 0xCCCCCC);
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
                    const isWater = waterGroup.getChildren().some(w => 
                         Phaser.Geom.Rectangle.Contains(w.getBounds(), wp.x, wp.y)
                    );
                    
                    if (!clickedObj && !isWater && inventoryRef.current.wood > 0) {
                        const tx = Math.floor(wp.x / 16) * 16 + 8;
                        const ty = Math.floor(wp.y / 16) * 16 + 8;
                        
                        if (Phaser.Math.Distance.Between(player.x, player.y, tx, ty) < 14) return;

                        const type = hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock';
                        const wall = obstaclesGroup.create(tx, ty, type);
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
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', fontFamily: 'monospace' }}>
            <div style={{ flex: 1, position: 'relative' }}>
                <div id="phaser-game" style={{ width: '100%', height: '100%' }}></div>
                <div style={{ position: 'absolute', top: 10, left: 10, color: '#aaa', background: 'rgba(0,0,0,0.8)', padding: '5px' }}>
                    {debugMsg}
                </div>
            </div>
            
            {/* 灰阶 UI 风格 */}
            <div style={{ width: '220px', background: '#1a1a1a', padding: '20px', color: '#ccc', borderLeft: '1px solid #333' }}>
                <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '10px' }}>📦 背包</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '20px 0' }}>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center', borderRadius: '2px' }}>
                        <div style={{ color: '#fff' }}>I (木)</div>
                        <b style={{ fontSize: '18px' }}>{inventory.wood}</b>
                    </div>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center', borderRadius: '2px' }}>
                        <div style={{ color: '#fff' }}>II (石)</div>
                        <b style={{ fontSize: '18px' }}>{inventory.stone}</b>
                    </div>
                </div>
                <div style={{ marginTop: 'auto', background: '#333', padding: '10px', borderRadius: '2px' }}>
                    <div>当前: {hotbar === 'wall_wood' ? '木墙' : '石墙'}</div>
                    <small style={{ color: '#888' }}>(按 E 切换)</small>
                </div>
                <button onClick={saveGame} style={{ marginTop: '20px', width: '100%', padding: '10px', background: '#444', color: 'white', border: '1px solid #666', cursor: 'pointer', fontFamily: 'monospace' }}>
                    保存进度
                </button>
            </div>
        </div>
    );
};

export default Game;