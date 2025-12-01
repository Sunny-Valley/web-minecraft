'use client';

import { useEffect, useRef, useState } from 'react';

const Game = () => {
    const gameRef = useRef(null);
    const isMountedRef = useRef(false);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [hotbar, setHotbar] = useState('wall_wood'); // 当前手中的方块
    const [debugMsg, setDebugMsg] = useState('初始化...');
    
    const inventoryRef = useRef(inventory);
    const hotbarRef = useRef(hotbar); // 用于穿透闭包

    useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
    useEffect(() => { hotbarRef.current = hotbar; }, [hotbar]);

    useEffect(() => {
        isMountedRef.current = true;

        const initGame = async () => {
            if (!isMountedRef.current || gameRef.current) return;

            const Phaser = (await import('phaser')).default;

            // --- 🎨 像素画素材定义 (16x16) ---
            // 使用字符串矩阵来画图，拒绝抽象几何体！
            const PixelArt = {
                // 调色板
                colors: {
                    _: null, // 透明
                    g: 0x4CAF50, d: 0x388E3C, // 浅绿/深绿
                    w: 0x2196F3, l: 0x64B5F6, // 水/波光
                    b: 0x795548, B: 0x3E2723, // 棕/深棕 (木头)
                    s: 0x9E9E9E, S: 0x616161, // 灰/深灰 (石头)
                    y: 0xFFEB3B, // 黄 (沙)
                    r: 0xE91E63, // 红 (花)
                    p: 0xF48FB1, // 粉 (猪/史莱姆)
                    o: 0xFF9800, // 橙 (花蕊)
                },
                // 图案定义 (16x16)
                textures: {
                    't_grass': [
                        'gggggggggggggggg',
                        'gggdggggggggdggg',
                        'gggggggggggggggg',
                        'ggggdggggggggggg',
                        'ggggggggggggdggg',
                        'gggggggggggggggg',
                        'gggdgggggggggggg',
                        'ggggggggdggggggg',
                    ],
                    'o_tree': [ // 像一棵真的树
                        '______dddd______',
                        '_____ddggdd_____',
                        '____ddggggdd____',
                        '____ddggggdd____',
                        '____ddggggdd____',
                        '_____ddggdd_____',
                        '______BBBB______',
                        '______BBBB______',
                    ],
                    'o_rock': [
                        '_____sssss______',
                        '___sssssssss____',
                        '__ssssSssssss___',
                        '__sssSSSsssss___',
                        '__ssssSssssss___',
                        '___sssssssss____',
                        '_____sssss______',
                        '________________',
                    ],
                    'd_flower': [ // 花朵 (装饰)
                        '________________',
                        '______r_r_______',
                        '_____r_o_r______',
                        '______r_r_______',
                        '_______g________',
                        '______gdg_______',
                        '_______g________',
                        '_______g________',
                    ],
                    'o_wall_wood': [ // 木墙
                        'BBBBBBBBBBBBBBBB',
                        'bBbBbBbBbBbBbBbB',
                        'bbbbbbbbbbbbbbbb',
                        'BBBBBBBBBBBBBBBB',
                        'bbbbbbbbbbbbbbbb',
                        'bBbBbBbBbBbBbBbB',
                        'bbbbbbbbbbbbbbbb',
                        'BBBBBBBBBBBBBBBB',
                    ],
                    'm_slime': [ // 史莱姆怪物
                        '________________',
                        '______gggg______',
                        '____gggggggg____',
                        '___gggggggggg___',
                        '___gBg____gBg___', // 眼睛
                        '___gggggggggg___',
                        '____gggggggg____',
                        '________________',
                    ]
                }
            };

            const config = {
                type: Phaser.AUTO,
                width: 800,
                height: 600,
                parent: 'phaser-game',
                backgroundColor: '#111',
                pixelArt: true, // 关键：开启像素模式
                roundPixels: true,
                scale: {
                    mode: Phaser.Scale.RESIZE,
                    autoCenter: Phaser.Scale.CENTER_BOTH
                },
                physics: {
                    default: 'arcade',
                    arcade: { debug: false }
                },
                scene: { preload, create, update }
            };

            const game = new Phaser.Game(config);
            gameRef.current = game;

            // --- 游戏内部变量 ---
            let player, cursors, wasd;
            let ghostBlock; // 幽灵方块
            let objectsGroup, decorGroup, slimesGroup; // 物体组、装饰组、生物组
            const mapSize = 80; // 更大的地图
            const tileSize = 16; // 更精细的方块 (16px)

            function preload() {
                const g = this.make.graphics({ add: false });

                // 1. 自动生成像素纹理
                Object.entries(PixelArt.textures).forEach(([key, rows]) => {
                    g.clear();
                    rows.forEach((row, y) => {
                        // 如果行数少于16，拉伸一下或者居中（这里简单处理，每行重复绘制2次高度模拟16px）
                        // 为了简单，我们上面定义的其实是 8x16 或者 16x16 的半成品
                        // 这里我们写一个像素绘制器，假设定义是 16x16 或者 8x16 放大
                        for (let x = 0; x < row.length; x++) {
                            const char = row[x];
                            const color = PixelArt.colors[char];
                            if (color !== undefined && color !== null) {
                                g.fillStyle(color);
                                // 我们的素材定义比较小，为了省事，纵向放大2倍
                                g.fillRect(x, y * 2, 1, 2); 
                            }
                        }
                    });
                    g.generateTexture(key, 16, 16);
                });

                // 补充纯色纹理
                g.clear(); g.fillStyle(0x2196F3); g.fillRect(0,0,16,16); g.generateTexture('t_water', 16, 16);
                g.clear(); g.fillStyle(0xFFEB3B); g.fillRect(0,0,16,16); g.generateTexture('t_sand', 16, 16);
                
                // 玩家 (稍微复杂点)
                g.clear();
                g.fillStyle(0xFFC107); g.fillRect(2,2,12,12); // 身体
                g.fillStyle(0x000000); g.fillRect(4,4,2,2); g.fillRect(10,4,2,2); // 眼睛
                g.fillStyle(0xFFFFFF); g.fillRect(4,10,8,2); // 嘴巴
                g.generateTexture('player', 16, 16);
            }

            function create() {
                setDebugMsg('生成地形中...');
                
                // 1. 地图生成
                const noise = (x, y) => Math.sin(x * 0.1) + Math.sin(y * 0.1) + Math.random() * 0.1;
                
                // 组初始化
                objectsGroup = this.physics.add.group({ immovable: true }); // 阻挡层
                decorGroup = this.add.group(); // 装饰层 (花草)
                slimesGroup = this.physics.add.group(); // 生物层

                for(let y=0; y<mapSize; y++) {
                    for(let x=0; x<mapSize; x++) {
                        const nx = x * 0.15;
                        const ny = y * 0.15;
                        const n = Math.sin(nx) * Math.cos(ny); // 简单的波浪噪声

                        const posX = x * tileSize;
                        const posY = y * tileSize;

                        // 地形判定
                        if (n < -0.4) {
                            // 水
                            const water = this.add.image(posX, posY, 't_water').setOrigin(0);
                            this.physics.add.existing(water, true);
                            water.body.setImmovable(true);
                            objectsGroup.add(water);
                            water.setData('type', 'water');
                        } else if (n < -0.2) {
                            // 沙滩
                            this.add.image(posX, posY, 't_sand').setOrigin(0);
                        } else {
                            // 草地
                            this.add.image(posX, posY, 't_grass').setOrigin(0);
                            
                            // 随机生成物体
                            const rand = Math.random();
                            if (rand < 0.05) {
                                const tree = objectsGroup.create(posX + 8, posY + 8, 'o_tree');
                                tree.body.setSize(12, 12); // 碰撞体积略小
                                tree.setData('type', 'tree');
                            } else if (rand < 0.06) {
                                const rock = objectsGroup.create(posX + 8, posY + 8, 'o_rock');
                                rock.body.setSize(12, 12);
                                rock.setData('type', 'rock');
                            } else if (rand < 0.15) {
                                // 装饰物 (花) - 无碰撞
                                decorGroup.create(posX + 8, posY + 8, 'd_flower').setDepth(0);
                            } else if (rand < 0.155) {
                                // 史莱姆
                                const slime = slimesGroup.create(posX + 8, posY + 8, 'm_slime');
                                slime.setBounce(1);
                                slime.setCollideWorldBounds(true);
                                slime.setVelocity(Phaser.Math.Between(-20, 20), Phaser.Math.Between(-20, 20));
                            }
                        }
                    }
                }

                // 2. 玩家
                player = this.physics.add.sprite(mapSize*tileSize/2, mapSize*tileSize/2, 'player');
                player.setCollideWorldBounds(true);
                player.setDepth(10); // 玩家在最上层
                player.body.setSize(10, 10); // 碰撞体积

                // 3. 摄像机
                this.physics.world.setBounds(0, 0, mapSize * tileSize, mapSize * tileSize);
                this.cameras.main.startFollow(player, true, 0.1, 0.1);
                this.cameras.main.setZoom(3); // 放大3倍，复古像素风！

                // 4. 碰撞关系
                this.physics.add.collider(player, objectsGroup);
                this.physics.add.collider(slimesGroup, objectsGroup);
                this.physics.add.collider(slimesGroup, slimesGroup);
                this.physics.add.collider(player, slimesGroup, (p, s) => {
                    // 简单的推开效果
                    const angle = Phaser.Math.Angle.Between(s.x, s.y, p.x, p.y);
                    p.setVelocity(Math.cos(angle)*200, Math.sin(angle)*200);
                });

                // 5. 建造预览 (Ghost Block)
                ghostBlock = this.add.image(0, 0, 'o_wall_wood').setAlpha(0.5).setDepth(20);
                
                // 6. 控制
                cursors = this.input.keyboard.createCursorKeys();
                wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68, e:69});
                
                // 7. 交互
                this.input.on('pointerdown', (pointer) => handleInput(this, pointer));
                
                // 8. 史莱姆 AI 跳跃逻辑
                this.time.addEvent({
                    delay: 2000,
                    loop: true,
                    callback: () => {
                        slimesGroup.children.iterate((slime) => {
                            if(slime) slime.setVelocity(Phaser.Math.Between(-30, 30), Phaser.Math.Between(-30, 30));
                        });
                    }
                });

                setDebugMsg('WASD移动 | 左键破坏 | 右键建造 | E键切换方块');
            }

            function update() {
                if (!player) return;
                
                // 玩家移动
                player.body.setVelocity(0);
                const speed = 100; // 像素越小，速度数值也要相应调小一点才自然
                
                if (cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                else if (cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                
                if (cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                else if (cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                // 切换方块
                if (Phaser.Input.Keyboard.JustDown(wasd.e)) {
                    setHotbar(prev => prev === 'wall_wood' ? 'wall_rock' : 'wall_wood');
                }

                // 更新 Ghost Block 位置
                const worldPoint = this.input.activePointer.positionToCamera(this.cameras.main);
                const tx = Math.floor(worldPoint.x / 16) * 16 + 8; // 中心对齐 (16/2=8)
                const ty = Math.floor(worldPoint.y / 16) * 16 + 8;
                
                ghostBlock.x = tx;
                ghostBlock.y = ty;
                
                // 根据是否有材料改变 Ghost Block 颜色
                const canBuild = inventoryRef.current.wood > 0; // 简化：假设都需要木头
                ghostBlock.setTint(canBuild ? 0xFFFFFF : 0xFF0000);
                ghostBlock.setTexture(hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock'); // 借用rock图作为石墙
            }

            function handleInput(scene, pointer) {
                const worldPoint = pointer.positionToCamera(scene.cameras.main);
                
                // 查找点击的物体
                const clickedObj = objectsGroup.getChildren().find(obj => 
                    Phaser.Geom.Rectangle.Contains(obj.getBounds(), worldPoint.x, worldPoint.y)
                );

                if (pointer.leftButtonDown()) {
                    // 左键：破坏
                    if (clickedObj) {
                        const type = clickedObj.getData('type');
                        if (type === 'water') return;

                        // 粒子特效
                        const particles = scene.add.particles(0, 0, type === 'tree' ? 't_grass' : 'o_rock', {
                            x: clickedObj.x, y: clickedObj.y,
                            speed: 50, lifespan: 300, scale: { start: 0.5, end: 0 },
                            quantity: 5
                        });
                        scene.time.delayedCall(300, () => particles.destroy());

                        clickedObj.destroy();
                        
                        setInventory(prev => {
                            const n = { ...prev };
                            if (type === 'tree' || type === 'wall') n.wood++;
                            else if (type === 'rock') n.stone++;
                            return n;
                        });
                    }
                } else if (pointer.rightButtonDown()) {
                    // 右键：建造
                    if (!clickedObj && inventoryRef.current.wood > 0) {
                        const tx = Math.floor(worldPoint.x / 16) * 16 + 8;
                        const ty = Math.floor(worldPoint.y / 16) * 16 + 8;
                        
                        // 距离检测
                        if (Phaser.Math.Distance.Between(player.x, player.y, tx, ty) > 50) {
                            setDebugMsg("太远了！");
                            return;
                        }
                        // 自身碰撞检测
                        if (Phaser.Math.Distance.Between(player.x, player.y, tx, ty) < 12) {
                            setDebugMsg("被挡住了！");
                            return;
                        }

                        const type = hotbarRef.current === 'wall_wood' ? 'o_wall_wood' : 'o_rock';
                        const wall = objectsGroup.create(tx, ty, type);
                        wall.body.setImmovable(true);
                        wall.setData('type', 'wall');
                        
                        setInventory(prev => ({ ...prev, wood: prev.wood - 1 }));
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
                <div style={{ position: 'absolute', top: 10, left: 10, color: '#fff', textShadow: '1px 1px 0 #000', fontFamily: 'monospace', pointerEvents: 'none' }}>
                    {debugMsg}
                </div>
            </div>
            
            <div style={{ width: '220px', background: '#2d2d2d', padding: '15px', color: '#eee', borderLeft: '4px solid #111', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ borderBottom: '2px solid #555', paddingBottom: '5px' }}>🎒 背包</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '15px 0' }}>
                    <div style={{ background: '#444', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px' }}>🪵</div>
                        <div style={{ fontWeight: 'bold' }}>{inventory.wood}</div>
                    </div>
                    <div style={{ background: '#444', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px' }}>🪨</div>
                        <div style={{ fontWeight: 'bold' }}>{inventory.stone}</div>
                    </div>
                </div>
                
                <div style={{ marginTop: 'auto', background: '#333', padding: '10px', borderRadius: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>当前建造:</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', background: hotbar === 'wall_wood' ? '#795548' : '#9E9E9E', border: '2px solid #fff' }}></div>
                        <div>{hotbar === 'wall_wood' ? '木墙' : '石墙'}</div>
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>(按 E 切换)</div>
                </div>

                <button onClick={saveGame} style={{ marginTop: '15px', padding: '10px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    ☁️ 保存进度
                </button>
            </div>
        </div>
    );
};

export default Game;