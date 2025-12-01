import { NextResponse } from 'next/server';

// 这是一个运行在服务端的 API
export async function POST(request) {
    // 1. 接收前端发来的 JSON 数据
    const body = await request.json();
    
    // 2. 模拟服务器处理逻辑 (比如验证数据，防止作弊)
    // 实际项目中，这里会连接 Redis 或 Postgres 数据库
    console.log("收到存档请求:", body);

    const woodCount = body.wood || 0;
    
    // 3. 返回结果
    return NextResponse.json({ 
        success: true, 
        message: `成功接收! 你有 ${woodCount} 个木头。`,
        saveId: Date.now() // 模拟生成的存档ID
    });
}