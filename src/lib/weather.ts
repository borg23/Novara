export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** 常用城市坐标（open-meteo 免 Key 数据源；高德接入见 README） */
export const CITIES: City[] = [
  { id: "beijing", name: "北京", lat: 39.9042, lon: 116.4074 },
  { id: "shanghai", name: "上海", lat: 31.2304, lon: 121.4737 },
  { id: "guangzhou", name: "广州", lat: 23.1291, lon: 113.2644 },
  { id: "shenzhen", name: "深圳", lat: 22.5431, lon: 114.0579 },
  { id: "hangzhou", name: "杭州", lat: 30.2741, lon: 120.1551 },
  { id: "chengdu", name: "成都", lat: 30.5728, lon: 104.0668 },
  { id: "wuhan", name: "武汉", lat: 30.5928, lon: 114.3055 },
  { id: "xian", name: "西安", lat: 34.3416, lon: 108.9398 },
  { id: "nanjing", name: "南京", lat: 32.0603, lon: 118.7969 },
  { id: "chongqing", name: "重庆", lat: 29.5630, lon: 106.5516 },
  { id: "tianjin", name: "天津", lat: 39.3434, lon: 117.3616 },
  { id: "suzhou", name: "苏州", lat: 31.2989, lon: 120.5853 },
  { id: "changsha", name: "长沙", lat: 28.2282, lon: 112.9388 },
  { id: "zhengzhou", name: "郑州", lat: 34.7466, lon: 113.6254 },
  { id: "qingdao", name: "青岛", lat: 36.0671, lon: 120.3826 },
  { id: "dalian", name: "大连", lat: 38.9140, lon: 121.6147 },
  { id: "xiamen", name: "厦门", lat: 24.4798, lon: 118.0894 },
  { id: "kunming", name: "昆明", lat: 25.0389, lon: 102.7183 },
  { id: "harbin", name: "哈尔滨", lat: 45.8038, lon: 126.5349 },
  { id: "shenyang", name: "沈阳", lat: 41.8057, lon: 123.4315 },
  { id: "jinan", name: "济南", lat: 36.6512, lon: 117.1201 },
  { id: "hefei", name: "合肥", lat: 31.8206, lon: 117.2272 },
  { id: "fuzhou", name: "福州", lat: 26.0745, lon: 119.2965 },
  { id: "nanchang", name: "南昌", lat: 28.6820, lon: 115.8579 },
  { id: "guiyang", name: "贵阳", lat: 26.6470, lon: 106.6302 },
  { id: "nanning", name: "南宁", lat: 22.8170, lon: 108.3665 },
  { id: "haikou", name: "海口", lat: 20.0440, lon: 110.1999 },
  { id: "lanzhou", name: "兰州", lat: 36.0611, lon: 103.8343 },
  { id: "urumqi", name: "乌鲁木齐", lat: 43.8256, lon: 87.6168 },
  { id: "lhasa", name: "拉萨", lat: 29.6520, lon: 91.1721 },
];

export function findCity(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

export const WEATHER_CODES: Record<number, string> = {
  0: "晴",
  1: "大部晴朗",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "米雪",
  80: "小阵雨",
  81: "阵雨",
  82: "强阵雨",
  85: "小阵雪",
  86: "大阵雪",
  95: "雷暴",
  96: "雷暴伴小冰雹",
  99: "雷暴伴大冰雹",
};

export function describeWeather(code: number): string {
  return WEATHER_CODES[code] ?? "未知";
}
