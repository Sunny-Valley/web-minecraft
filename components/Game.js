'use client';

import { useEffect, useRef, useState } from 'react';

const Game = () => {
    const gameRef = useRef(null);
    const isMountedRef = useRef(false);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [debugMsg, setDebugMsg] = useState('初始化...');
    
    // 穿透闭包，让游戏能读取最新 state
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
                    backgroundColor: '#1a1a1a', // 稍微亮一点的背景，区分黑屏
                    pixelArt: true,
                    scale: {
                        mode: Phaser.Scale.RESIZE,
                        autoCenter: Phaser.Scale.CENTER_BOTH
                    },
                    physics: {
                        default: 'arcade',
                        arcade: { debug: false }
                    },
                    scene: {
                        preload: preload,
                        create: create,
                        update: update
                    }
                };

                const game = new Phaser.Game(config);
                gameRef.current = game;
                setDebugMsg('引擎加载完成，正在生成世界...');

                // --- 游戏内部变量 ---
                let player, cursors, wasd, marker;
                const objectsGroup = []; // 存储所有物体

                function preload() {
                    // 直接画图，确保素材存在
                    const g = this.make.graphics({ add: false });
                    
                    // 1. 地面：草 (32x32)
                    g.fillStyle(0x4CAF50); g.fillRect(0,0,32,32);
                    g.fillStyle(0x388E3C); g.fillRect(Math.random()*28, Math.random()*28, 4, 4); // 杂点
                    g.generateTexture('t_grass', 32, 32); g.clear();

                    // 2. 地面：水
                    g.fillStyle(0x2196F3); g.fillRect(0,0,32,32);
                    g.fillStyle(0xFFFFFF, 0.5); g.fillRect(5,5,20,5); // 波光
                    g.generateTexture('t_water', 32, 32); g.clear();

                    // 3. 物体：树
                    g.fillStyle(0x2E7D32); g.fillCircle(16,16,14);
                    g.generateTexture('o_tree', 32, 32); g.clear();

                    // 4. 物体：石
                    g.fillStyle(0x9E9E9E); g.fillCircle(16,16,12);
                    g.generateTexture('o_rock', 32, 32); g.clear();
                    
                    // 5. 物体：墙
                    g.fillStyle(0x795548); g.fillRect(2,2,28,28);
                    g.lineStyle(2, 0x5D4037); g.strokeRect(2,2,28,28);
                    g.generateTexture('o_wall', 32, 32); g.clear();

                    // 6. 玩家
                    g.fillStyle(0xFFEB3B); g.fillRect(4,4,24,24); // 黄色小人
                    g.fillStyle(0x000000); g.fillRect(8,8,4,4); g.fillRect(20,8,4,4);
                    g.generateTexture('player', 32, 32);
                }

                function create() {
                    setDebugMsg('正在渲染地图...');
                    this.cameras.main.setBackgroundColor('#2d2d2d'); // 设置背景色

                    // 简单噪声函数
                    const noise = (x, y) => Math.sin(x * 0.1 + y * 0.2) + Math.sin(x * 0.3 + y * 0.1) * 0.5;

                    // --- 生成地图 (使用 Sprite 替代 Tilemap，防止黑屏) ---
                    const mapSize = 40; // 40x40
                    const tileSize = 32;

                    // 1. 铺地面
                    for(let y=0; y<mapSize; y++) {
                        for(let x=0; x<mapSize; x++) {
                            const n = noise(x, y);
                            let texture = 't_grass';
                            let isWater = false;

                            if (n < -0.5) { texture = 't_water'; isWater = true; }

                            const tile = this.add.image(x * tileSize, y * tileSize, texture).setOrigin(0);
                            
                            // 如果是水，开启物理碰撞
                            if (isWater) {
                                this.physics.add.existing(tile, true); // 静态刚体
                                objectsGroup.push({ sprite: tile, type: 'water' });
                            }

                            // 2. 生成物体 (树/石) - 只有草地生成
                            if (!isWater) {
                                let objType = null;
                                if (Math.random() < 0.1) objType = 'o_tree';
                                else if (Math.random() < 0.03) objType = 'o_rock';

                                if (objType) {
                                    const obj = this.physics.add.sprite(x * tileSize + 16, y * tileSize + 16, objType);
                                    obj.setImmovable(true);
                                    objectsGroup.push({ sprite: obj, type: objType });
                                }
                            }
                        }
                    }

                    // --- 玩家设置 ---
                    player = this.physics.add.sprite(400, 400, 'player');
                    player.setCollideWorldBounds(true);
                    this.physics.world.setBounds(0, 0, mapSize * tileSize, mapSize * tileSize);
                    
                    // 摄像机
                    this.cameras.main.startFollow(player, true);
                    this.cameras.main.setZoom(1.5);

                    // 碰撞逻辑
                    objectsGroup.forEach(obj => {
                        this.physics.add.collider(player, obj.sprite);
                    });

                    // 交互框
                    marker = this.add.graphics();
                    marker.lineStyle(2, 0xffffff, 1);
                    
                    // 控制
                    cursors = this.input.keyboard.createCursorKeys();
                    wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68});

                    // 点击事件
                    this.input.on('pointerdown', (pointer) => handleInput(this, pointer));

                    setDebugMsg('✅ 游戏就绪! 移动:WASD');
                }

                function update() {
                    if (!player) return;
                    player.body.setVelocity(0);
                    const speed = 200;
                    
                    if (cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                    if (cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                    if (cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                    if (cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                    // 高亮框
                    const worldPoint = this.input.activePointer.positionToCamera(this.cameras.main);
                    const tx = Math.floor(worldPoint.x / 32) * 32;
                    const ty = Math.floor(worldPoint.y / 32) * 32;
                    marker.clear();
                    marker.strokeRect(tx, ty, 32, 32);
                }

                function handleInput(scene, pointer) {
                    const worldPoint = pointer.positionToCamera(scene.cameras.main);
                    
                    // 简单的点击检测 (遍历所有物体，性能稍差但稳)
                    // 找到点击范围内的物体
                    const clickedObjIndex = objectsGroup.findIndex(item => 
                        Phaser.Geom.Rectangle.Contains(item.sprite.getBounds(), worldPoint.x, worldPoint.y)
                    );

                    if (pointer.leftButtonDown()) {
                        // 左键：破坏
                        if (clickedObjIndex !== -1) {
                            const item = objectsGroup[clickedObjIndex];
                            if (item.type === 'water') return; // 水不能挖

                            // 销毁物体
                            item.sprite.destroy();
                            objectsGroup.splice(clickedObjIndex, 1);
                            
                            // 更新背包
                            setInventory(prev => {
                                const n = { ...prev };
                                if (item.type.includes('tree') || item.type.includes('wall')) n.wood++;
                                else if (item.type.includes('rock')) n.stone++;
                                return n;
                            });
                        }
                    } else if (pointer.rightButtonDown()) {
                        // 右键：建造 (墙)
                        if (clickedObjIndex === -1 && inventoryRef.current.wood > 0) {
                            const tx = Math.floor(worldPoint.x / 32) * 32 + 16;
                            const ty = Math.floor(worldPoint.y / 32) * 32 + 16;
                            
                            const newWall = scene.physics.add.sprite(tx, ty, 'o_wall');
                            newWall.setImmovable(true);
                            scene.physics.add.collider(player, newWall);
                            
                            objectsGroup.push({ sprite: newWall, type: 'o_wall' });
                            
                            setInventory(prev => ({ ...prev, wood: prev.wood - 1 }));
                        }
                    }
                }

            } catch (err) {
                setDebugMsg(`❌ 崩溃: ${err.message}`);
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

    // 存档逻辑
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
                <div style={{ position: 'absolute', top: 10, left: 10, color: '#0f0', background: 'rgba(0,0,0,0.8)', padding: '5px 10px', fontSize: '14px', pointerEvents: 'none' }}>
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
            </div>
        </div>
    );
};

export default Game;