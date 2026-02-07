# Coffee Shop Recommendations Feature

## 概述
本功能在 Voice Navigation 应用中添加了**搜索附近咖啡店**和**智能推荐**的能力，用户可以在地图上查看并导航到推荐的咖啡店。

---

## 🎯 功能特性

### 1. 地图搜索按钮
- 在地图右下角添加"Coffee Shops"搜索按钮
- 点击按钮搜索当前地图中心附近的咖啡店
- 搜索过程中显示加载动画
- 错误处理和友好的错误提示

### 2. 智能推荐算法
基于以下因素的加权评分系统：
- **评分权重 (40%)**：Google Reviews 评分（满分5分）
- **评论数权重 (30%)**：对数刻度的评论数量
- **距离权重 (20%)**：离搜索中心的距离（越近越好）
- **营业状态权重 (10%)**：当前是否营业

**推荐分数范围**：0-10 分

### 3. 地图标记
- 咖啡店以不同颜色的圆形标记显示
- 标记颜色反映评分：红→黄→绿（低→高）
- 悬停显示店铺名称和评分

### 4. 推荐列表
详细展示推荐的咖啡店：
- **排序选项**：
  - Recommendation Score（综合评分，默认）
  - Rating（评分）
  - Distance（距离）
  - Review Count（评论数）
- **店铺信息**：
  - 名称和排名
  - 评分和评论数
  - 距离
  - 地址
  - 营业状态（开放/关闭）
  - 电话和网站链接

---

## 📁 文件结构

### 后端文件（Node.js）

#### `server/src/services/placeService.js`
Google Places API 集成层
- `findNearbyCoffeeShops(lat, lng, radius)` - 搜索附近咖啡店
- `getPlaceDetails(placeId)` - 获取单个咖啡店详细信息
- `calculateDistance(lat1, lng1, lat2, lng2)` - 计算两点距离

#### `server/src/utils/coffeeShopRecommender.js`
推荐算法和数据格式化
- `calculateRecommendationScore()` - 计算推荐分数
- `recommendCoffeeShops()` - 获取排序的推荐列表
- `formatShopForDisplay()` - 格式化店铺数据用于前端显示

#### `server/src/routes/navigation.js`（修改）
添加新的 API 端点
- `POST /api/find-coffee-shops` - 搜索并推荐咖啡店

---

### 前端文件（React）

#### `client/src/services/coffeeShopService.js`
前端 API 调用层
- `searchCoffeeShops(lat, lng, options)` - 调用后端搜索接口
- `formatShop()` - 前端数据格式化

#### `client/src/components/CoffeeShopRecommendations.jsx`
推荐列表组件
- 响应式卡片布局
- 多种排序选项
- 店铺信息展示
- 导航按钮

#### `client/src/components/CoffeeShopRecommendations.css`
推荐列表样式
- 卡片设计
- 响应式布局
- 动画效果

#### `client/src/components/MapDisplay.jsx`（修改）
添加搜索功能
- 搜索按钮和加载状态
- 咖啡店标记渲染
- 错误处理

#### `client/src/App.jsx`（修改）
状态管理
- 咖啡店数据状态
- 事件处理器

#### `client/src/App.css`（修改）
地图控制按钮样式

---

## 🔌 API 端点

### POST `/api/find-coffee-shops`

**请求体：**
```json
{
  "lat": 37.7749,           // 必需：纬度
  "lng": -122.4194,         // 必需：经度
  "radius": 5000,           // 可选：搜索半径（米），默认5000
  "limit": 5,               // 可选：返回数量上限，默认5
  "sortBy": "score",        // 可选：排序方式，默认"score"
  "openNowOnly": false      // 可选：仅返回营业中的店铺，默认false
}
```

**响应体：**
```json
{
  "success": true,
  "recommendations": [
    {
      "placeId": "ChIJ...",
      "name": "Blue Bottle Coffee",
      "location": {
        "lat": 37.7749,
        "lng": -122.4194
      },
      "rating": 4.5,
      "reviewCount": 320,
      "distance": "450m",
      "distanceValue": 450,
      "address": "66 Mint St, San Francisco, CA 94103, USA",
      "vicinity": "66 Mint St",
      "openNow": true,
      "types": ["cafe", "restaurant"],
      "website": "https://bluebottlecoffee.com",
      "phone": "+1 415-123-4567",
      "recommendationScore": 8.7,
      "scoreBreakdown": {
        "rating": 9.0,
        "reviews": 8.5,
        "distance": 8.2,
        "openNow": 10.0
      }
    }
    // ... more shops
  ],
  "totalFound": 24,
  "searchCenter": {
    "lat": 37.7749,
    "lng": -122.4194
  },
  "searchRadius": 5000
}
```

**错误响应：**
```json
{
  "error": "Latitude and longitude are required"
}
```

---

## 🚀 使用流程

### 用户端操作
1. 使用语音输入规划路线
2. 地图加载完成后，点击地图右下角的"Coffee Shops"按钮
3. 等待搜索结果（通常 1-3 秒）
4. 查看左侧面板的推荐咖啡店列表
5. 可以使用下拉菜单按不同条件排序
6. 点击"Navigate"按钮可设置咖啡店作为目的地（未来功能）
7. 地图上会显示咖啡店的标记

### 技术流程
```
用户点击按钮
    ↓
MapDisplay.handleSearchCoffeeShops()
    ↓
获取地图中心坐标
    ↓
调用 coffeeShopService.searchCoffeeShops()
    ↓
POST /api/find-coffee-shops
    ↓
后端 placeService 调用 Google Places API
    ↓
placeService 获取所有附近咖啡店详情
    ↓
coffeeShopRecommender 计算推荐分数并排序
    ↓
返回 Top 5-10 推荐
    ↓
前端渲染列表和地图标记
```

---

## ⚙️ 配置需求

### 环境变量
在 `.env` 文件中确保设置：
```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

### Google Maps API 必需权限
需要启用以下 API：
- ✅ Maps JavaScript API（已有）
- ✅ Places API（需要）
- ✅ Geocoding API（已有）

### 前端环境变量（可选）
在 `client/.env` 中可配置：
```
VITE_API_URL=http://localhost:3001/api
```

---

## 🔍 推荐算法详解

### 分数计算公式

```
总分 = (评分分 × 0.4) + (评论分 × 0.3) + (距离分 × 0.2) + (营业分 × 0.1)

其中：
  - 评分分 = (rating / 5) × 10，范围 [0, 10]
  - 评论分 = min(10, log₁₀(reviewCount + 1) × 2)，范围 [0, 10]
  - 距离分 = max(0, 10 - (distance / maxDistance) × 10)，范围 [0, 10]
  - 营业分 = openNow ? 10 : 5
```

### 示例计算
假设一个咖啡店的数据：
- 评分：4.5/5 → 评分分 = 9.0
- 评论数：320 → 评论分 = min(10, log₁₀(321) × 2) = 8.5
- 距离：500m → 距离分 = 10 - (500/5000) × 10 = 9.0
- 营业：开放 → 营业分 = 10.0

**总推荐分** = (9.0 × 0.4) + (8.5 × 0.3) + (9.0 × 0.2) + (10.0 × 0.1) = 9.05

---

## 🎨 UI/UX 设计

### 地图控制按钮
- 位置：地图右下角
- 样式：蓝色 (#667eea) 渐变
- 悬停效果：升起并增加阴影
- 加载状态：显示旋转动画

### 推荐列表卡片
- 最大高度 600px，支持滚动
- 排名标记（1-10）
- 色彩编码的评分条
- 绿色（开放）/红色（关闭）状态徽章

### 地图标记
- 咖啡店：小圆形，颜色反映评分
- 路线点：字母标记，颜色编码（绿=起点，红=终点，蓝=中转点）

---

## 📱 响应式设计
- **桌面** (> 768px)：3 列统计信息
- **平板** (480-768px)：2 列统计信息
- **手机** (< 480px)：1 列统计信息，简化布局

---

## 🐛 错误处理

### 常见错误场景

| 错误 | 原因 | 解决方案 |
|-----|------|--------|
| "坐标为空" | 地图未加载 | 等待地图加载完成 |
| "API 错误" | Google API 配额用尽 | 检查 API 限制和账单 |
| "未找到结果" | 该区域无咖啡店 | 扩大搜索半径或移动地图 |
| "网络错误" | 连接问题 | 检查网络连接 |

---

## 🔮 未来扩展建议

1. **导航集成** - 将咖啡店添加为路线中转点
2. **收藏功能** - 保存喜爱的咖啡店
3. **筛选功能** - 按类型、价格范围筛选
4. **用户评分** - 本地存储用户的个人评分
5. **实时排队** - 显示该店铺排队状况
6. **菜单集成** - 查看咖啡店的菜单和价格
7. **预订功能** - 直接预约座位
8. **社交分享** - 分享发现的咖啡店

---

## 📝 开发笔记

### 性能优化
- Places API 调用已使用 Promise.all() 并行获取详情
- 搜索结果在前端缓存，避免重复请求
- 列表虚拟化可应用于超过 100 个结果的场景

### 已知限制
- Google Places API 有每日查询限制
- 一次请求最多返回 60 个结果（Google 限制）
- 免费 API 层级有速率限制

### 测试建议
- 在不同地理位置测试
- 测试网络离线场景
- 验证 API 配额消耗
- 性能测试（测量加载时间）

---

## 📞 支持

如需帮助或报告 bug，请检查：
1. `.env` 文件配置是否正确
2. Google Maps API 是否已启用所需权限
3. 浏览器控制台是否有错误信息
4. 网络连接是否正常

---

**版本**：1.0  
**最后更新**：2026-02-06  
**维护者**：Voice Navigation Team
