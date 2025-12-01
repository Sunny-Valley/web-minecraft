'use client';
import dynamic from 'next/dynamic';

// 禁用 SSR (服务端渲染)，因为 Phaser 只能在浏览器跑
const GameComponent = dynamic(() => import('../components/Game'), { 
    ssr: false,
    loading: () => <p style={{color:'white'}}>正在加载游戏引擎...</p>
});

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <GameComponent />
    </main>
  );
}