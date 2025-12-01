'use client';

import { useEffect, useRef, useState } from 'react';
import { Noise } from 'noisejs';

const Game = () => {
    const gameRef = useRef(null);
    // React 状态：背包和当前工具
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [selectedTool, setSelectedTool] = useState(1); // 1:斧头(砍伐), 2:建造
    const [cloudMsg, setCloudMsg] = useState('未连接服务器');

    // 这一步是为了把 React 的 state 更新函数传递给 Phaser
    // 因为 Phaser 的 create 函数只执行一次，闭包会锁死旧的 state
    const inventoryRef = useRef(inventory);
    inventoryRef.current = inventory;

    useEffect(() => {
        // 动态引入 Phaser (必须在 useEffect 里，确保在浏览器环境)
        let Phaser;
        import('phaser').then((module) => {
            Phaser = module.default;
            initGame(Phaser);
        });

        function initGame(Phaser) {
            if (gameRef.current) return;

            const config = {
                type: Phaser.AUTO,
                width: 800,
                height: 600,
                parent: 'phaser-game',
                pixelArt: true,
                backgroundColor: '#000000',
                physics: {
                    default: 'arcade',
                    arcade: { gravity: { y: 0 } } // 上帝视角无重力
                },
                scene: {
                    preload: preload,
                    create: create,
                    update: update
                }
            };

            const game = new Phaser.Game(config);
            gameRef.current = game;

            // --- 游戏变量 ---
            let player, cursors, wasd;
            let map, groundLayer, objectLayer;
            let marker;
            const noise = new Noise(Math.random());

            // --- 1. 资源预加载 (代码画图) ---
            function preload() {
                const g = this.make.graphics({ x: 0, y: 0, add: false });

                // 辅助函数：画噪点纹理
                const drawNoise = (color, noiseColor, density = 20) => {
                    g.fillStyle(color); g.fillRect(0, 0, 32, 32);
                    g.fillStyle(noiseColor);
                    for(let i=0; i<density; i++) g.fillRect(Math.random()*32, Math.random()*32, 2, 2);
                };

                // [地形] 草地
                drawNoise(0x4CAF50, 0x388E3C); 
                g.generateTexture('tile_grass', 32, 32); g.clear();
                // [地形] 沙子
                drawNoise(0xFFEB3B, 0xFBC02D);
                g.generateTexture('tile_sand', 32, 32); g.clear();
                // [地形] 水
                g.fillStyle(0x2196F3); g.fillRect(0,0,32,32);
                g.fillStyle(0x64B5F6); g.fillRect(5,5,20,4); // 波光
                g.generateTexture('tile_water', 32, 32); g.clear();

                // [物体] 树
                g.fillStyle(0x000000, 0); g.fillRect(0,0,32,32); // 透明底
                g.fillStyle(0x2E7D32); g.fillCircle(16,16,14);
                g.fillStyle(0x1B5E20); g.fillCircle(16,16,10);
                g.generateTexture('obj_tree', 32, 32); g.clear();

                // [物体] 石头
                g.fillStyle(0x000000, 0); g.fillRect(0,0,32,32);
                g.fillStyle(0x9E9E9E); g.fillCircle(16,16,12);
                g.fillStyle(0x616161); g.fillCircle(12,12,4);
                g.generateTexture('obj_rock', 32, 32); g.clear();

                // [物体] 墙壁 (玩家建造)
                g.fillStyle(0x795548); g.fillRect(0,0,32,32);
                g.lineStyle(2, 0x3E2723); g.strokeRect(0,0,32,32);
                g.generateTexture('obj_wall', 32, 32); g.clear();

                // [玩家]
                g.fillStyle(0x2196F3); g.fillRect(4,4,24,24);
                g.fillStyle(0xFFFFFF); g.fillRect(8,8,4,4); g.fillRect(20,8,4,4); // 眼睛
                g.generateTexture('player', 32, 32);
            }

            // --- 2. 创建世界 ---
            function create() {
                this.input.mouse.disableContextMenu(); // 禁用右键菜单

                // 生成 Atlas (为了 Tilemap 性能)
                const groundAtlas = this.make.graphics({x:0, y:0, add:false});
                groundAtlas.drawTexture('tile_grass', 0, 0); // ID 0
                groundAtlas.drawTexture('tile_sand', 32, 0); // ID 1
                groundAtlas.drawTexture('tile_water', 64, 0); // ID 2
                groundAtlas.generateTexture('atlas_ground', 96, 32);

                const objAtlas = this.make.graphics({x:0, y:0, add:false});
                objAtlas.drawTexture('obj_tree', 0, 0);   // ID 0 (Tree)
                objAtlas.drawTexture('obj_rock', 32, 0);  // ID 1 (Rock)
                objAtlas.drawTexture('obj_wall', 64, 0);  // ID 2 (Wall)
                objAtlas.generateTexture('atlas_obj', 96, 32);

                // 生成地图数据
                const width = 60, height = 60;
                const groundData = [], objData = [];

                for(let y=0; y<height; y++) {
                    let gRow = [], oRow = [];
                    for(let x=0; x<width; x++) {
                        let v = noise.perlin2(x/15, y/15); // 地形噪声
                        
                        if(v < -0.2) { // 水
                            gRow.push(2); oRow.push(-1);
                        } else if(v < 0) { // 沙滩
                            gRow.push(1); oRow.push(-1);
                        } else { // 草地
                            gRow.push(0);
                            // 随机生成树和石头
                            if(Math.random() < 0.08) oRow.push(0); // 树
                            else if(Math.random() < 0.02) oRow.push(1); // 石
                            else oRow.push(-1);
                        }
                    }
                    groundData.push(gRow);
                    objData.push(oRow);
                }

                // 创建 Tilemap
                map = this.make.tilemap({ tileWidth: 32, tileHeight: 32, width, height });
                
                const tsGround = map.addTilesetImage('atlas_ground', null, 32, 32, 0, 0);
                groundLayer = map.createBlankLayer('Ground', tsGround);
                
                const tsObj = map.addTilesetImage('atlas_obj', null, 32, 32, 0, 0);
                objectLayer = map.createBlankLayer('Objects', tsObj);

                // 填充数据
                for(let y=0; y<height; y++){
                    for(let x=0; x<width; x++){
                        groundLayer.putTileAt(groundData[y][x], x, y);
                        if(objData[y][x] !== -1) objectLayer.putTileAt(objData[y][x], x, y);
                    }
                }

                // 碰撞设置
                groundLayer.setCollision(2); // 水不可走
                objectLayer.setCollisionBetween(0, 10); // 所有物体不可穿过

                this.physics.world.setBounds(0, 0, width*32, height*32);

                // 玩家设置
                player = this.physics.add.sprite(400, 400, 'player');
                player.setCollideWorldBounds(true);
                this.physics.add.collider(player, groundLayer);
                this.physics.add.collider(player, objectLayer);

                // 摄像机
                this.cameras.main.startFollow(player);
                this.cameras.main.setZoom(1.5);

                // 交互框
                marker = this.add.graphics();
                marker.lineStyle(2, 0xffffff, 1);
                marker.strokeRect(0, 0, 32, 32);

                // 输入
                cursors = this.input.keyboard.createCursorKeys();
                wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68});

                // 点击事件
                this.input.on('pointerdown', (pointer) => {
                    handleInteraction(this, pointer);
                });
            }

            function handleInteraction(scene, pointer) {
                const worldPoint = pointer.positionToCamera(scene.cameras.main);
                const tileX = map.worldToTileX(worldPoint.x);
                const tileY = map.worldToTileY(worldPoint.y);
                const dist = Phaser.Math.Distance.Between(player.x, player.y, worldPoint.x, worldPoint.y);

                if(dist > 150) return; // 距离限制

                const targetObj = objectLayer.getTileAt(tileX, tileY);
                const targetGround = groundLayer.getTileAt(tileX, tileY);

                if (pointer.leftButtonDown()) {
                    // 左键：破坏
                    if(targetObj) {
                        // 更新 React State (使用函数式更新以保证数据准确)
                        if(targetObj.index === 0) { // 树
                            setInventory(prev => ({ ...prev, wood: prev.wood + 1 }));
                            createParticles(scene, worldPoint.x, worldPoint.y, 0x2E7D32);
                        } else if(targetObj.index === 1) { // 石
                            setInventory(prev => ({ ...prev, stone: prev.stone + 1 }));
                            createParticles(scene, worldPoint.x, worldPoint.y, 0x9E9E9E);
                        } else { // 墙
                            setInventory(prev => ({ ...prev, wood: prev.wood + 1 })); // 回收
                        }
                        objectLayer.removeTileAt(tileX, tileY);
                    }
                } else if (pointer.rightButtonDown()) {
                    // 右键：建造 (消耗木头)
                    // 注意：这里需要读取最新的 React State，用 ref
                    if(inventoryRef.current.wood > 0 && !targetObj && targetGround.index !== 2) {
                        objectLayer.putTileAt(2, tileX, tileY); // 放墙(ID 2)
                        setInventory(prev => ({ ...prev, wood: prev.wood - 1 }));
                        createParticles(scene, worldPoint.x, worldPoint.y, 0x795548);
                    }
                }
            }

            function createParticles(scene, x, y, color) {
                 // 简易粒子效果
                 const p = scene.add.rectangle(x, y, 4, 4, color);
                 scene.tweens.add({
                     targets: p,
                     alpha: 0,
                     scale: 3,
                     duration: 300,
                     onComplete: () => p.destroy()
                 });
            }

            function update() {
                if(!player) return;
                player.body.setVelocity(0);
                const speed = 200;
                
                if(cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                if(cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                if(cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                if(cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                // 更新高亮框
                const worldPoint = this.input.activePointer.positionToCamera(this.cameras.main);
                const tileX = map.worldToTileX(worldPoint.x);
                const tileY = map.worldToTileY(worldPoint.y);
                marker.x = tileX * 32;
                marker.y = tileY * 32;
            }
        }

        return () => {
            if(gameRef.current) gameRef.current.destroy(true);
            gameRef.current = null;
        }
    }, []); // Empty dependency array = run once on mount

    // 每次 inventory 更新时，同步到 ref，供 Phaser 读取
    useEffect(() => {
        inventoryRef.current = inventory;
    }, [inventory]);

    // --- 调用后端 API ---
    const saveGame = async () => {
        setCloudMsg('正在上传...');
        try {
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inventory)
            });
            const data = await res.json();
            setCloudMsg(`✅ ${data.message}`);
        } catch (e) {
            setCloudMsg('❌ 上传失败');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', background: '#111' }}>
            {/* 左侧：游戏区 */}
            <div style={{ flex: 1, position: 'relative' }}>
                <div id="phaser-game" style={{ width: '100%', height: '100%' }}></div>
                {/* 悬浮的操作提示 */}
                <div style={{ 
                    position: 'absolute', bottom: 20, left: 20, 
                    color: 'rgba(255,255,255,0.7)', pointerEvents: 'none' 
                }}>
                    WASD 移动 | 左键破坏 | 右键建造
                </div>
            </div>

            {/* 右侧：React UI 面板 */}
            <div style={{ width: '300px', background: '#222', padding: '20px', color: 'white', borderLeft: '2px solid #444', display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ borderBottom: '1px solid #555', paddingBottom: '10px' }}>📦 背包状态</h2>
                
                <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: '#333', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px' }}>🪵</div>
                        <div style={{ color: '#aaa', fontSize: '12px' }}>木头</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{inventory.wood}</div>
                    </div>
                    <div style={{ background: '#333', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '24px' }}>🪨</div>
                        <div style={{ color: '#aaa', fontSize: '12px' }}>石头</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{inventory.stone}</div>
                    </div>
                </div>

                <div style={{ marginTop: 'auto', background: '#333', padding: '15px', borderRadius: '8px' }}>
                    <h3 style={{ fontSize: '16px', margin: '0 0 10px 0' }}>☁️ 云存档</h3>
                    <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                        将当前物资同步到 Vercel Serverless 数据库。
                    </p>
                    <button 
                        onClick={saveGame}
                        style={{ 
                            width: '100%', padding: '10px', 
                            background: '#0070f3', border: 'none', 
                            color: 'white', borderRadius: '4px', cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        上传数据
                    </button>
                    <p style={{ marginTop: '10px', fontSize: '12px', textAlign: 'center', color: cloudMsg.includes('✅')?'#4caf50':'#ff5252' }}>
                        {cloudMsg}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Game;