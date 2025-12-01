'use client';

import { useEffect, useRef, useState } from 'react';

const Game = () => {
    const gameRef = useRef(null);
    const isMountedRef = useRef(false);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [statusMsg, setStatusMsg] = useState('正在初始化引擎...');
    const inventoryRef = useRef(inventory);

    // 同步 React 状态给 Phaser 使用
    useEffect(() => {
        inventoryRef.current = inventory;
    }, [inventory]);

    useEffect(() => {
        isMountedRef.current = true;

        // 简易噪声算法 (替代外部库，防止依赖报错)
        const SimpleNoise = {
            noise2D: function(x, y) {
                const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                return n - Math.floor(n);
            }
        };

        const initPhaser = async () => {
            try {
                const Phaser = (await import('phaser')).default;
                
                if (!isMountedRef.current || gameRef.current) return;

                const config = {
                    type: Phaser.AUTO,
                    width: 800,
                    height: 600,
                    parent: 'phaser-game',
                    pixelArt: true,
                    backgroundColor: '#000000',
                    scale: {
                        mode: Phaser.Scale.RESIZE, // 强制自适应
                        autoCenter: Phaser.Scale.CENTER_BOTH
                    },
                    physics: {
                        default: 'arcade',
                        arcade: { gravity: { y: 0 } }
                    },
                    scene: {
                        preload: preload,
                        create: create,
                        update: update
                    }
                };

                const game = new Phaser.Game(config);
                gameRef.current = game;
                setStatusMsg('游戏运行中');

                // --- 游戏逻辑 ---
                let player, cursors, wasd;
                let map, groundLayer, objectLayer;
                let marker;

                function preload() {
                    const g = this.make.graphics({ x: 0, y: 0, add: false });
                    
                    // 绘制基础纹理
                    const drawRect = (color) => {
                        g.fillStyle(color); g.fillRect(0,0,32,32);
                        g.fillStyle(0x000000, 0.1); // 加点杂色
                        for(let i=0;i<5;i++) g.fillRect(Math.random()*32, Math.random()*32, 4, 4);
                    };

                    drawRect(0x4CAF50); g.generateTexture('tile_grass', 32, 32); g.clear();
                    drawRect(0xFFEB3B); g.generateTexture('tile_sand', 32, 32); g.clear();
                    g.fillStyle(0x2196F3); g.fillRect(0,0,32,32); g.generateTexture('tile_water', 32, 32); g.clear();
                    
                    // 树
                    g.fillStyle(0x2E7D32); g.fillCircle(16,16,14); 
                    g.generateTexture('obj_tree', 32, 32); g.clear();
                    
                    // 石
                    g.fillStyle(0x9E9E9E); g.fillCircle(16,16,12);
                    g.generateTexture('obj_rock', 32, 32); g.clear();
                    
                    // 墙
                    g.fillStyle(0x795548); g.fillRect(0,0,32,32); g.lineStyle(2,0x3E2723); g.strokeRect(0,0,32,32);
                    g.generateTexture('obj_wall', 32, 32); g.clear();

                    // 玩家
                    g.fillStyle(0x03A9F4); g.fillRect(4,4,24,24);
                    g.generateTexture('player', 32, 32);
                }

                function create() {
                    this.input.mouse.disableContextMenu();

                    // 生成地图数据
                    const width = 50, height = 50;
                    const mapData = [];
                    const objData = [];

                    for(let y=0; y<height; y++) {
                        let row = [], oRow = [];
                        for(let x=0; x<width; x++) {
                            // 使用内置简单噪声
                            let n = SimpleNoise.noise2D(x/10, y/10);
                            
                            if(n < 0.2) { row.push(2); oRow.push(-1); } // 水
                            else if(n < 0.3) { row.push(1); oRow.push(-1); } // 沙
                            else { 
                                row.push(0); // 草
                                if(Math.random()<0.05) oRow.push(0); // 树
                                else if(Math.random()<0.02) oRow.push(1); // 石
                                else oRow.push(-1);
                            }
                        }
                        mapData.push(row);
                        objData.push(oRow);
                    }

                    map = this.make.tilemap({ tileWidth: 32, tileHeight: 32, width, height });
                    
                    // 临时生成 tileset
                    const atlasG = this.make.graphics({x:0,y:0,add:false});
                    atlasG.drawTexture('tile_grass',0,0); atlasG.drawTexture('tile_sand',32,0); atlasG.drawTexture('tile_water',64,0);
                    atlasG.generateTexture('atlas_g', 96, 32);
                    const tsG = map.addTilesetImage('atlas_g', null, 32, 32, 0, 0);
                    groundLayer = map.createBlankLayer('G', tsG);

                    const atlasO = this.make.graphics({x:0,y:0,add:false});
                    atlasO.drawTexture('obj_tree',0,0); atlasO.drawTexture('obj_rock',32,0); atlasO.drawTexture('obj_wall',64,0);
                    atlasO.generateTexture('atlas_o', 96, 32);
                    const tsO = map.addTilesetImage('atlas_o', null, 32, 32, 0, 0);
                    objectLayer = map.createBlankLayer('O', tsO);

                    // 填充
                    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
                        groundLayer.putTileAt(mapData[y][x], x, y);
                        if(objData[y][x]!==-1) objectLayer.putTileAt(objData[y][x], x, y);
                    }

                    groundLayer.setCollision(2);
                    objectLayer.setCollisionBetween(0, 10);
                    this.physics.world.setBounds(0,0, width*32, height*32);

                    player = this.physics.add.sprite(400, 400, 'player');
                    player.setCollideWorldBounds(true);
                    this.physics.add.collider(player, groundLayer);
                    this.physics.add.collider(player, objectLayer);
                    this.cameras.main.startFollow(player, true);
                    this.cameras.main.setZoom(1.5);

                    cursors = this.input.keyboard.createCursorKeys();
                    wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68});
                    marker = this.add.graphics();
                    
                    this.input.on('pointerdown', (pointer) => handleInteraction(this, pointer));
                }

                function update() {
                    if(!player) return;
                    player.body.setVelocity(0);
                    const speed = 200;
                    if(cursors.left.isDown || wasd.a.isDown) player.body.setVelocityX(-speed);
                    if(cursors.right.isDown || wasd.d.isDown) player.body.setVelocityX(speed);
                    if(cursors.up.isDown || wasd.w.isDown) player.body.setVelocityY(-speed);
                    if(cursors.down.isDown || wasd.s.isDown) player.body.setVelocityY(speed);

                    const wp = this.input.activePointer.positionToCamera(this.cameras.main);
                    const tx = map.worldToTileX(wp.x);
                    const ty = map.worldToTileY(wp.y);
                    marker.clear();
                    marker.lineStyle(2, 0xffffff, 1);
                    marker.strokeRect(tx*32, ty*32, 32, 32);
                }

                function handleInteraction(scene, pointer) {
                    const wp = pointer.positionToCamera(scene.cameras.main);
                    const tx = map.worldToTileX(wp.x);
                    const ty = map.worldToTileY(wp.y);
                    const tile = objectLayer.getTileAt(tx, ty);
                    
                    if(pointer.leftButtonDown() && tile) {
                        const idx = tile.index;
                        objectLayer.removeTileAt(tx, ty);
                        setInventory(prev => {
                            const n = {...prev};
                            if(idx===0 || idx===2) n.wood++;
                            else if(idx===1) n.stone++;
                            return n;
                        });
                    } else if(pointer.rightButtonDown() && !tile && inventoryRef.current.wood > 0) {
                        objectLayer.putTileAt(2, tx, ty);
                        setInventory(prev => ({...prev, wood: prev.wood-1}));
                    }
                }

            } catch (error) {
                console.error("游戏启动失败:", error);
                setStatusMsg(`启动错误: ${error.message}`);
            }
        };

        initPhaser();

        return () => {
            isMountedRef.current = false;
            if(gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        }
    }, []);

    // API 上传
    const saveGame = async () => {
        setStatusMsg('正在上传...');
        try {
            await fetch('/api/save', { 
                method: 'POST', body: JSON.stringify(inventory) 
            });
            setStatusMsg('✅ 存档成功');
        } catch(e) { setStatusMsg('❌ 上传失败'); }
    };

    return (
        <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#111', overflow: 'hidden' }}>
            <div style={{ flex: 1, position: 'relative', minHeight: '100%' }}>
                {/* 游戏容器，确保 ID 存在 */}
                <div id="phaser-game" style={{ width: '100%', height: '100%' }}></div>
                
                {/* 状态调试显示 */}
                <div style={{ position: 'absolute', top: 10, left: 10, color: 'lime', background:'rgba(0,0,0,0.7)', padding: '5px' }}>
                    状态: {statusMsg}
                </div>
            </div>

            <div style={{ width: '280px', background: '#222', padding: '20px', color: 'white', borderLeft: '1px solid #444', zIndex: 10 }}>
                <h2>📦 背包</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '20px 0' }}>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center' }}>
                        <div>🪵 木头</div>
                        <h2>{inventory.wood}</h2>
                    </div>
                    <div style={{ background: '#333', padding: '10px', textAlign: 'center' }}>
                        <div>🪨 石头</div>
                        <h2>{inventory.stone}</h2>
                    </div>
                </div>
                <button onClick={saveGame} style={{ width: '100%', padding: '10px', background: '#0070f3', border: 'none', color: 'white', cursor: 'pointer' }}>
                    上传存档
                </button>
            </div>
        </div>
    );
};

export default Game;