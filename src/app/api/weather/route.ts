import { getSessionUser } from "@/lib/auth";
import { findCity, describeWeather } from "@/lib/weather";
import { json, badRequest, unauthorized } from "@/lib/http";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const cityId = req.nextUrl.searchParams.get("city") ?? "beijing";
  const city = findCity(cityId);
  if (!city) return badRequest("未知城市");

  const provider = (process.env.WEATHER_PROVIDER ?? "open-meteo").toLowerCase();
  if (provider === "amap" && process.env.AMAP_KEY) {
    return amapWeather(city.name);
  }
  return openMeteoWeather(city.lat, city.lon, city.name);
}

async function openMeteoWeather(lat: number, lon: number, cityName: string) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=Asia%2FShanghai&forecast_days=3`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = await res.json();
    const daily = (data.daily?.time ?? []).map((t: string, i: number) => ({
      date: t,
      max: data.daily.temperature_2m_max[i],
      min: data.daily.temperature_2m_min[i],
      text: describeWeather(data.daily.weather_code[i]),
    }));
    return json({
      provider: "open-meteo",
      city: cityName,
      current: {
        temp: data.current.temperature_2m,
        text: describeWeather(data.current.weather_code),
        wind: data.current.wind_speed_10m,
      },
      daily,
    });
  } catch (e) {
    return json({ provider: "open-meteo", city: cityName, error: `天气服务暂不可用：${(e as Error).message}` }, 502);
  }
}

async function amapWeather(cityName: string) {
  const key = process.env.AMAP_KEY as string;
  try {
    const geo = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(cityName)}&key=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    const geoData = await geo.json();
    const adcode = geoData?.geocodes?.[0]?.adcode;
    if (!adcode) throw new Error("高德地理编码失败");
    const res = await fetch(
      `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&extensions=all&key=${key}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (data.status !== "1") throw new Error(data.info ?? "高德天气接口失败");
    const forecast = data.forecasts?.[0];
    return json({
      provider: "amap",
      city: forecast?.city ?? cityName,
      current: {
        temp: forecast?.casts?.[0]?.daytemp ?? null,
        text: forecast?.casts?.[0]?.dayweather ?? "未知",
        wind: forecast?.casts?.[0]?.daywind ?? "",
      },
      daily: (forecast?.casts ?? []).map((c: Record<string, string>) => ({
        date: c.date,
        max: c.daytemp,
        min: c.nighttemp,
        text: c.dayweather,
      })),
    });
  } catch (e) {
    return json({ provider: "amap", city: cityName, error: `高德天气接口异常：${(e as Error).message}` }, 502);
  }
}
