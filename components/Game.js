'use client'; // 标记为客户端组件

import { useEffect, useRef, useState } from 'react';
// 动态引入 Phaser，防止服务端渲染报错
import * as Phaser from 'phaser';
import { Noise } from 'noisejs';

const Game = () => {
    const gameRef = useRef(null);
    const [inventory, setInventory] = useState({ wood: 0, stone: 0 });
    const [msg, setMsg] = useState('未连接服务器');

    useEffect(() => {
        if (gameRef.current) return; // 防止重复初始化

        // --- Phaser 游戏配置 ---
        const config = {
            type: Phaser.AUTO,
            width: 800, // 嵌入式窗口大小
            height: 600,
            parent: 'phaser-game', // 挂载到 div id
            pixelArt: true,
            backgroundColor: '#1a1a1a',
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

        // --- 游戏逻辑 (闭包内) ---
        let player, cursors, wasd, map, layer;
        const noise = new Noise(Math.random());

        function preload() {
            // 这里的 this 是 Phaser Scene
            const g = this.make.graphics({x:0, y:0, add:false});
            
            // 简单的纹理生成
            g.fillStyle(0x4CAF50); g.fillRect(0,0,32,32);
            g.generateTexture('grass', 32, 32); g.clear();
            
            g.fillStyle(0x795548); g.fillRect(0,0,32,32); // 树干颜色
            g.fillStyle(0x2E7D32); g.fillRect(4,4,24,24); // 树叶
            g.generateTexture('tree', 32, 32); g.clear();

            g.fillStyle(0x2196F3); g.fillRect(0,0,20,20);
            g.generateTexture('player', 20, 20);
        }

        function create() {
            // 生成地图
            const mapSize = 50;
            const data = [];
            for(let y=0; y<mapSize; y++){
                let row = [];
                for(let x=0; x<mapSize; x++){
                    let v = noise.perlin2(x/10, y/10);
                    row.push(0); // 全是草
                }
                data.push(row);
            }
            
            map = this.make.tilemap({ data: data, tileWidth: 32, tileHeight: 32 });
            const tiles = map.addTilesetImage('grass', null, 32, 32);
            layer = map.createLayer(0, tiles, 0, 0);

            // 随机种树
            for(let i=0; i<50; i++) {
                let tx = Phaser.Math.Between(0, mapSize*32);
                let ty = Phaser.Math.Between(0, mapSize*32);
                let tree = this.physics.add.sprite(tx, ty, 'tree').setImmovable(true);
                tree.setData('type', 'tree');
                this.physics.add.collider(player, tree); // 稍后定义player
            }

            player = this.physics.add.sprite(400, 300, 'player');
            this.cameras.main.startFollow(player);
            
            cursors = this.input.keyboard.createCursorKeys();
            wasd = this.input.keyboard.addKeys({w:87, a:65, s:83, d:68});

            // 点击交互
            this.input.on('pointerdown', (pointer) => {
                // React 和 Phaser 通信：更新 React State
                // 注意：在 Phaser 内部直接调用 setInventory
                
                // 模拟简单的获取
                // 实际项目中这里应该发射事件
                setInventory(prev => ({ ...prev, wood: prev.wood + 1 }));
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
        }

        // 清理函数
        return () => {
            game.destroy(true);
        };
    }, []);

    // --- 调用后端 API (Serverless Function) ---
    const saveGame = async () => {
        setMsg('正在连接云端...');
        try {
            const res = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inventory)
            });
            const data = await res.json();
            setMsg(`云端响应: ${data.message} (ID: ${data.saveId})`);
        } catch (e) {
            setMsg('保存失败');
        }
    };

    return (
        <div style={{ display: 'flex', gap: '20px', padding: '20px', color: 'white' }}>
            <div id="phaser-game" style={{ borderRadius: '10px', overflow: 'hidden' }}></div>
            
            <div style={{ fontFamily: 'sans-serif' }}>
                <h2>🎒 玩家背包 (React UI)</h2>
                <p>🪵 木头: {inventory.wood}</p>
                <p>🪨 石头: {inventory.stone}</p>
                
                <div style={{ marginTop: '20px', borderTop: '1px solid #555', paddingTop: '10px' }}>
                    <h3>☁️ Vercel Serverless</h3>
                    <p style={{ fontSize: '12px', color: '#888' }}>点击方块挖掘，然后点击保存</p>
                    <button 
                        onClick={saveGame}
                        style={{ padding: '10px 20px', background: '#0070f3', border: 'none', color: 'white', borderRadius: '5px', cursor: 'pointer' }}
                    >
                        上传存档到云端
                    </button>
                    <p style={{ marginTop: '10px', color: '#00ff00' }}>{msg}</p>
                </div>
            </div>
        </div>
    );
};

export default Game;