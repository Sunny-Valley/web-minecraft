'use client';

import { useEffect, useRef, useState } from 'react';

const Game = () => {
    const gameRef = useRef(null);
    const isMountedRef = useRef(false);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [debugMsg, setDebugMsg] = useState('初始化...');
    
    // 穿透闭包
    const inventoryRef = useRef(inventory);
    useEffect(() => { inventoryRef.current = inventory; }, [inventory]);

    useEffect(() => {
        isMountedRef.current = true;

        const initGame = async () => {
            if (!isMountedRef.current || gameRef.current) return;

            try {
                const Phaser = (await import('phaser')).default;
                
                const config = {
                    type: Phaser.AUTO,
                    width: 800,
                    height: 600,
                    parent: 'phaser-game',
                    backgroundColor: '#1a1a1a',
                    pixelArt: true, // 像素风必开
                    scale: {
                        mode: Phaser.Scale.RESIZE,
                        autoCenter: Phaser.Scale.CENTER_BOTH
                    },
                    physics: {
                        default: 'arcade',
                        arcade: { debug: false } // 改为 true 可以看到红色的碰撞框，方便调试
                    },
                    scene: {
                        preload: preload,
                        create: create,
                        update: update
                    }
                };

                const game = new Phaser.Game(config);
                gameRef.current = game;
                setDebugMsg('点击画面开始游戏');

                // --- 游戏变量 ---
                let player, cursors, wasd, marker;
                const objectsGroup = []; // 存储所有障碍物
                const mapSize = 50; // 地图大小 50x50
                const tileSize = 32;

                function preload() {
                    const g = this.make.graphics({ add: false });
                    
                    // 1. 地面：草 (带杂色)
                    g.fillStyle(0x4CAF50); g.fillRect(0,0,32,32);
                    g.fillStyle(0x388E3C); for(let i=0;i<4;i++) g.fillRect(Math.random()*28, Math.random()*28, 4, 4);
                    g.generateTexture('t_grass', 32, 32); g.clear();

                    // 2. 地面：水 (带波纹)
                    g.fillStyle(0x2196F3); g.fillRect(0,0,32,32);
                    g.fillStyle(0xFFFFFF, 0.4); g.fillRect(5,5,20,4); g.fillRect(10,20,10,4);
                    g.generateTexture('t_water', 32, 32); g.clear();

                    // 3. 物体：树
                    g.fillStyle(0x2E7D32); g.fillCircle(16,16,14); g.fillStyle(0x1B5E20); g.fillCircle(16,16,8);
                    g.generateTexture('o_tree', 32, 32); g.clear();

                    // 4. 物体：石
                    g.fillStyle(0x9E9E9E); g.fillCircle(16,16,12); g.fillStyle(0x616161); g.fillCircle(12,12,6);
                    g.generateTexture('o_rock', 32, 32); g.clear();
                    
                    // 5. 物体：墙
                    g.fillStyle(0x795548); g.fillRect(0,0,32,32); g.lineStyle(4, 0x3E2723); g.strokeRect(0,0,32,32);
                    g.generateTexture('o_wall', 32, 32); g.clear();

                    // 6. 玩家 (黄色方块，加个眼睛标识方向)
                    g.fillStyle(0xFFEB3B); g.fillRect(4,4,24,24);
                    g.fillStyle(0x000000); g.fillRect(8,8,4,4); g.fillRect(20,8,4,4);
                    g.generateTexture('player', 32, 32);
                }

                function create() {
                    setDebugMsg('正在生成世界...');
                    this.cameras.main.setBackgroundColor('#2d2d2d');

                    // 简单的地形算法
                    const noise = (x, y) => Math.sin(x * 0.15 + y * 0.25) + Math.sin(x * 0.3 + y * 0.1) * 0.5;

                    // 记录所有非障碍物的位置，用于出生
                    const safeSpots = [];

                    for(let y=0; y<mapSize; y++) {
                        for(let x=0; x<mapSize; x++) {
                            const n = noise(x, y);
                            
                            // 1. 生成水 (-0.5 以下)
                            if (n < -0.5) { 
                                const water = this.add.image(x * tileSize, y * tileSize, 't_water').setOrigin(0);
                                this.physics.add.existing(water, true); // 静态碰撞体
                                objectsGroup.push({ sprite: water, type: 'water' });
                                continue; // 是水就跳过后续，不能生成树
                            }

                            // 2. 生成草
                            this.add.image(x * tileSize, y * tileSize, 't_grass').setOrigin(0);
                            let isOccupied = false;

                            // 3. 随机生成树和石头
                            let objType = null;
                            const rand = Math.random();
                            if (rand < 0.08) objType = 'o_tree';
                            else if (rand < 0.11) objType = 'o_rock';

                            if (objType) {
                                const obj = this.physics.add.sprite(x * tileSize + 16, y * tileSize + 16, objType);
                                obj.setImmovable(true);
                                objectsGroup.push({ sprite: obj, type: objType });
                                isOccupied = true;
                            }

                            // 如果这里是草地且没有物体，加入安全点列表
                            if (!isOccupied) {
                                safeSpots.push({ x: x * tileSize + 16, y: y * tileSize + 16 });
                            }
                        }
                    }

                    // --- 寻找安全出生点 (关键修复) ---
                    let spawnX = 400, spawnY = 400;
                    if (safeSpots.length > 0) {
                        // 随机选一个安全点
                        const spot = safeSpots[Math.floor(Math.random() * safeSpots.length)];
                        spawnX = spot.x;
                        spawnY = spot.y;
                    }

                    // 创建玩家
                    player = this.physics.add.sprite(spawnX, spawnY, 'player');
                    player.setCollideWorldBounds(true);
                    // 稍微缩小玩家的碰撞体积，防止走路太容易卡住
                    player.body.setSize(20, 20); 

                    this.physics.world.setBounds(0, 0, mapSize * tileSize, mapSize * tileSize);
                    this.cameras.main.startFollow(player, true);
                    this.cameras.main.setZoom(1.5);

                    // 批量添加碰撞
                    objectsGroup.forEach(obj => {
                        this.physics.add.collider(player, obj.sprite);
                    });

                    // 交互框
                    marker = this.add.graphics();
                    marker.lineStyle(2, 0xffffff, 1);
                    
                    // 输入控制
                    cursors = this.input.keyboard.createCursorKeys();
                    wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68});

                    // 鼠标点击
                    this.input.on('pointerdown', (pointer) => {
                        // 确保获得焦点
                        window.focus();
                        handleInput(this, pointer);
                    });

                    setDebugMsg('✅ 游戏就绪! 点一下屏幕，然后用 WASD 移动');
                }

                function update() {
                    if (!player) return;
                    player.body.setVelocity(0);
                    const speed = 200;
                    
                    // 移动逻辑
                    if (cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                    else if (cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                    
                    if (cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                    else if (cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                    // 如果有速度，归一化（防止斜向加速）
                    if (player.body.velocity.x !== 0 || player.body.velocity.y !== 0) {
                        player.body.velocity.normalize().scale(speed);
                    }

                    // 高亮框跟随鼠标
                    const worldPoint = this.input.activePointer.positionToCamera(this.cameras.main);
                    const tx = Math.floor(worldPoint.x / 32) * 32;
                    const ty = Math.floor(worldPoint.y / 32) * 32;
                    marker.clear();
                    marker.strokeRect(tx, ty, 32, 32);
                }

                function handleInput(scene, pointer) {
                    const worldPoint = pointer.positionToCamera(scene.cameras.main);
                    
                    // 检测点击是否命中了某个物体
                    // 简单的距离检测或者矩形检测
                    const clickedIndex = objectsGroup.findIndex(obj => 
                        Phaser.Geom.Rectangle.Contains(obj.sprite.getBounds(), worldPoint.x, worldPoint.y)
                    );

                    if (pointer.leftButtonDown()) {
                        // 左键：破坏
                        if (clickedIndex !== -1) {
                            const obj = objectsGroup[clickedIndex];
                            if (obj.type === 'water') return; // 水不能挖

                            // 简单的破坏动画
                            scene.tweens.add({
                                targets: obj.sprite, alpha: 0, duration: 100,
                                onComplete: () => {
                                    obj.sprite.destroy();
                                    objectsGroup.splice(clickedIndex, 1); // 从数组移除
                                }
                            });

                            // 更新背包
                            setInventory(prev => {
                                const n = { ...prev };
                                if (obj.type.includes('tree') || obj.type.includes('wall')) n.wood++;
                                else if (obj.type.includes('rock')) n.stone++;
                                return n;
                            });
                        }
                    } 
                    else if (pointer.rightButtonDown()) {
                        // 右键：建造墙壁
                        if (clickedIndex === -1 && inventoryRef.current.wood > 0) {
                            // 对齐网格
                            const tx = Math.floor(worldPoint.x / 32) * 32 + 16;
                            const ty = Math.floor(worldPoint.y / 32) * 32 + 16;
                            
                            // 检查玩家是否站在那里（防止把自己砌在墙里）
                            if (Phaser.Math.Distance.Between(player.x, player.y, tx, ty) < 25) {
                                setDebugMsg("⚠️ 不能在脚下建造！");
                                return;
                            }

                            const newWall = scene.physics.add.sprite(tx, ty, 'o_wall');
                            newWall.setImmovable(true);
                            scene.physics.add.collider(player, newWall);
                            objectsGroup.push({ sprite: newWall, type: 'o_wall' });

                            setInventory(prev => ({ ...prev, wood: prev.wood - 1 }));
                        }
                    }
                }

            } catch (err) {
                setDebugMsg(`❌ 错误: ${err.message}`);
                console.error(err);
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
        setDebugMsg('正在上传...');
        try {
            await fetch('/api/save', { method: 'POST', body: JSON.stringify(inventory) });
            setDebugMsg('✅ 存档成功');
        } catch (e) { setDebugMsg('❌ 上传失败'); }
    };

    return (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
            <div style={{ flex: 1, position: 'relative' }}>
                <div id="phaser-game" style={{ width: '100%', height: '100%' }}></div>
                <div style={{ position: 'absolute', top: 10, left: 10, color: '#0f0', background: 'rgba(0,0,0,0.8)', padding: '5px 10px', fontSize: '14px', pointerEvents: 'none', userSelect: 'none' }}>
                    状态: {debugMsg}
                </div>
            </div>
            
            <div style={{ width: '250px', background: '#222', padding: '20px', color: 'white', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
                <h3>📦 背包</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center' }}>
                        <div>🪵</div><h3>{inventory.wood}</h3>
                    </div>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center' }}>
                        <div>🪨</div><h3>{inventory.stone}</h3>
                    </div>
                </div>
                <button onClick={saveGame} style={{ padding: '10px', background: '#0070f3', color: 'white', border: 'none', cursor: 'pointer' }}>上传存档</button>
                <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
                    <p>🕹️ 操作指南：</p>
                    <ul style={{ paddingLeft: '20px' }}>
                        <li>点一下游戏区激活</li>
                        <li>WASD 移动</li>
                        <li>左键 破坏树/石</li>
                        <li>右键 建造墙壁</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Game;