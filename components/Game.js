'use client';

import { useEffect, useRef, useState } from 'react';
import { Noise } from 'noisejs';

const Game = () => {
    // 游戏实例引用
    const gameRef = useRef(null);
    // 挂载状态引用 (防止 React 严格模式导致的双重初始化)
    const isMountedRef = useRef(false);

    // React 状态：背包和工具
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [cloudMsg, setCloudMsg] = useState('未连接服务器');

    // 使用 Ref 穿透闭包，让 Phaser 能读取到最新的 React 状态
    const inventoryRef = useRef(inventory);
    useEffect(() => {
        inventoryRef.current = inventory;
    }, [inventory]);

    useEffect(() => {
        // 标记组件已挂载
        isMountedRef.current = true;
        let PhaserInstance = null;

        // 动态导入 Phaser (仅在客户端执行)
        import('phaser').then((module) => {
            // 如果组件已经卸载，或者游戏已经存在，则停止初始化
            if (!isMountedRef.current || gameRef.current) return;

            const Phaser = module.default;
            PhaserInstance = Phaser;

            const config = {
                type: Phaser.AUTO,
                width: 800,
                height: 600,
                parent: 'phaser-game', // 挂载到 ID 为 phaser-game 的 div
                pixelArt: true, // 开启像素完美模式
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

            // 创建游戏实例
            const game = new Phaser.Game(config);
            gameRef.current = game;

            // --- 游戏内部变量 ---
            let player, cursors, wasd;
            let map, groundLayer, objectLayer;
            let marker;
            const noise = new Noise(Math.random());

            // --- 1. 预加载：程序化生成像素纹理 ---
            function preload() {
                const g = this.make.graphics({ x: 0, y: 0, add: false });

                // 辅助函数：绘制带噪点的方块
                const drawNoise = (color, noiseColor) => {
                    g.fillStyle(color); g.fillRect(0, 0, 32, 32);
                    g.fillStyle(noiseColor);
                    for(let i=0; i<15; i++) g.fillRect(Math.random()*32, Math.random()*32, 2, 2);
                };

                // 地面：草地 (ID 0)
                drawNoise(0x4CAF50, 0x388E3C);
                g.generateTexture('tile_grass', 32, 32); g.clear();

                // 地面：沙子 (ID 1)
                drawNoise(0xFFEB3B, 0xFBC02D);
                g.generateTexture('tile_sand', 32, 32); g.clear();

                // 地面：水 (ID 2)
                g.fillStyle(0x2196F3); g.fillRect(0,0,32,32);
                g.fillStyle(0x64B5F6); g.fillRect(5,5,20,4); g.fillRect(10,20,15,3);
                g.generateTexture('tile_water', 32, 32); g.clear();

                // 物体：树 (ID 0)
                g.fillStyle(0x000000, 0); g.fillRect(0,0,32,32); // 透明背景
                g.fillStyle(0x2E7D32); g.fillCircle(16,16,14); // 树冠
                g.fillStyle(0x1B5E20); g.fillCircle(16,16,10); // 阴影
                g.generateTexture('obj_tree', 32, 32); g.clear();

                // 物体：石头 (ID 1)
                g.fillStyle(0x000000, 0); g.fillRect(0,0,32,32);
                g.fillStyle(0x9E9E9E); g.fillCircle(16,16,12);
                g.fillStyle(0x616161); g.fillCircle(12,12,4);
                g.generateTexture('obj_rock', 32, 32); g.clear();

                // 物体：墙壁 (ID 2)
                g.fillStyle(0x795548); g.fillRect(0,0,32,32);
                g.lineStyle(2, 0x3E2723); g.strokeRect(0,0,32,32);
                g.generateTexture('obj_wall', 32, 32); g.clear();

                // 玩家
                g.fillStyle(0x2196F3); g.fillRect(4,4,24,24); // 身体
                g.fillStyle(0xFFFFFF); g.fillRect(8,8,4,4); g.fillRect(20,8,4,4); // 眼睛
                g.generateTexture('player', 32, 32);
            }

            // --- 2. 创建：生成地图与对象 ---
            function create() {
                this.input.mouse.disableContextMenu();

                // 生成贴图集 (Atlas) 以优化 Tilemap 性能
                const groundAtlas = this.make.graphics({x:0, y:0, add:false});
                groundAtlas.drawTexture('tile_grass', 0, 0);
                groundAtlas.drawTexture('tile_sand', 32, 0);
                groundAtlas.drawTexture('tile_water', 64, 0);
                groundAtlas.generateTexture('atlas_ground', 96, 32);

                const objAtlas = this.make.graphics({x:0, y:0, add:false});
                objAtlas.drawTexture('obj_tree', 0, 0);
                objAtlas.drawTexture('obj_rock', 32, 0);
                objAtlas.drawTexture('obj_wall', 64, 0);
                objAtlas.generateTexture('atlas_obj', 96, 32);

                // 地图参数
                const width = 60;
                const height = 60;
                const groundData = [];
                const objData = [];

                // 使用柏林噪声生成地形
                for(let y=0; y<height; y++) {
                    let gRow = [];
                    let oRow = [];
                    for(let x=0; x<width; x++) {
                        let v = noise.perlin2(x/15, y/15);
                        
                        if(v < -0.2) {
                            gRow.push(2); // 水
                            oRow.push(-1); // 无物体
                        } else if(v < -0.05) {
                            gRow.push(1); // 沙子
                            oRow.push(-1);
                        } else {
                            gRow.push(0); // 草地
                            // 随机生成植被
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
                
                // 添加图层
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

                // 设置碰撞
                groundLayer.setCollision(2); // 水不可通行
                objectLayer.setCollisionBetween(0, 10); // 树、石、墙不可穿过

                this.physics.world.setBounds(0, 0, width*32, height*32);

                // 玩家设置
                player = this.physics.add.sprite(400, 400, 'player');
                player.setCollideWorldBounds(true);
                this.physics.add.collider(player, groundLayer);
                this.physics.add.collider(player, objectLayer);

                // 摄像机跟随
                this.cameras.main.startFollow(player, true, 0.1, 0.1);
                this.cameras.main.setZoom(1.5);

                // 鼠标高亮框
                marker = this.add.graphics();
                marker.lineStyle(2, 0xffffff, 1);
                marker.strokeRect(0, 0, 32, 32);

                // 键盘输入
                cursors = this.input.keyboard.createCursorKeys();
                wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68});

                // 鼠标点击事件
                this.input.on('pointerdown', (pointer) => handleInteraction(this, pointer));
            }

            // --- 3. 更新：每一帧运行 ---
            function update() {
                if(!player) return;

                // 移动逻辑
                player.body.setVelocity(0);
                const speed = 200;
                
                if(cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                if(cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                if(cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                if(cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                // 归一化速度（防止斜向加速）
                player.body.velocity.normalize().scale(speed);

                // 更新高亮框位置
                const worldPoint = this.input.activePointer.positionToCamera(this.cameras.main);
                const tileX = map.worldToTileX(worldPoint.x);
                const tileY = map.worldToTileY(worldPoint.y);
                marker.x = tileX * 32;
                marker.y = tileY * 32;

                // 距离提示颜色
                const dist = Phaser.Math.Distance.Between(player.x, player.y, worldPoint.x, worldPoint.y);
                marker.clear();
                marker.lineStyle(2, dist < 150 ? 0xffffff : 0xff0000, 1);
                marker.strokeRect(0, 0, 32, 32);
            }

            // --- 交互逻辑 ---
            function handleInteraction(scene, pointer) {
                const worldPoint = pointer.positionToCamera(scene.cameras.main);
                const tileX = map.worldToTileX(worldPoint.x);
                const tileY = map.worldToTileY(worldPoint.y);
                const dist = Phaser.Math.Distance.Between(player.x, player.y, worldPoint.x, worldPoint.y);

                if (dist > 150) return; // 距离太远

                const targetObj = objectLayer.getTileAt(tileX, tileY);
                const targetGround = groundLayer.getTileAt(tileX, tileY);

                // 左键：破坏
                if (pointer.leftButtonDown()) {
                    if (targetObj) {
                        const idx = targetObj.index;
                        objectLayer.removeTileAt(tileX, tileY);
                        
                        // 更新 React 状态
                        setInventory(prev => {
                            const next = { ...prev };
                            if(idx === 0) next.wood += 1; // 树
                            else if(idx === 1) next.stone += 1; // 石
                            else if(idx === 2) next.wood += 1; // 墙 (回收)
                            return next;
                        });

                        // 粒子特效
                        const color = idx === 0 ? 0x2E7D32 : (idx === 1 ? 0x9E9E9E : 0x795548);
                        createParticles(scene, worldPoint.x, worldPoint.y, color);
                    }
                } 
                // 右键：建造
                else if (pointer.rightButtonDown()) {
                    // 读取 Ref 中的最新库存，防止闭包过时
                    const currentInv = inventoryRef.current;
                    
                    if (currentInv.wood > 0 && !targetObj && targetGround.index !== 2) {
                        objectLayer.putTileAt(2, tileX, tileY); // 放置墙壁
                        
                        setInventory(prev => ({ ...prev, wood: prev.wood - 1 }));
                        createParticles(scene, worldPoint.x, worldPoint.y, 0x795548);
                    }
                }
            }

            function createParticles(scene, x, y, color) {
                const p = scene.add.rectangle(x, y, 8, 8, color);
                scene.tweens.add({
                    targets: p,
                    scale: 0,
                    angle: 360,
                    duration: 400,
                    onComplete: () => p.destroy()
                });
            }
        });

        // 清理函数：组件卸载时销毁游戏
        return () => {
            isMountedRef.current = false;
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []); // 依赖项为空，只运行一次

    // --- 上传存档 ---
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
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#111', overflow: 'hidden' }}>
            {/* 游戏画布容器 */}
            <div style={{ flex: 1, position: 'relative' }}>
                <div id="phaser-game" style={{ width: '100%', height: '100%' }}></div>
                <div style={{ 
                    position: 'absolute', bottom: 20, left: 20, 
                    color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.5)', 
                    padding: '5px 10px', borderRadius: '4px', pointerEvents: 'none',
                    fontSize: '14px'
                }}>
                    WASD 移动 | 左键破坏 | 右键建造
                </div>
            </div>

            {/* 右侧 React UI */}
            <div style={{ width: '280px', background: '#222', padding: '20px', color: 'white', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ borderBottom: '1px solid #555', paddingBottom: '10px', margin: '0 0 20px 0' }}>📦 背包</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
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
                    <h3 style={{ fontSize: '14px', margin: '0 0 10px 0' }}>☁️ 云存档</h3>
                    <button 
                        onClick={saveGame}
                        style={{ 
                            width: '100%', padding: '10px', 
                            background: '#0070f3', border: 'none', 
                            color: 'white', borderRadius: '4px', cursor: 'pointer',
                            fontWeight: 'bold', transition: 'background 0.2s'
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