import type {
  AnalyzeResponse,
  AppMeta,
  CreateMealInput,
  DayResponse,
  FoodCatalogItem,
  Meal,
  Profile,
  Targets
} from "../../shared/types";

const DEVICE_KEY = "shike.device.v1";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "REQUEST_FAILED") {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server-side-device";
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing && existing.length >= 8) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-device-id", getDeviceId());
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiRequestError("连接不到服务，请确认 API 已启动", 0, "NETWORK_ERROR");
  }

  if (!response.ok) {
    let message = "请求失败，请稍后重试";
    let code = "REQUEST_FAILED";
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      message = body.error ?? message;
      code = body.code ?? code;
    } catch {
      // 非 JSON 错误响应，保留默认文案。
    }
    throw new ApiRequestError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchMeta(): Promise<AppMeta> {
  return request<AppMeta>("/api/meta");
}

export async function fetchProfile(): Promise<Profile> {
  const data = await request<{ profile: Profile }>("/api/profile");
  return data.profile;
}

export async function fetchDay(date: string): Promise<DayResponse> {
  return request<DayResponse>(`/api/day?date=${encodeURIComponent(date)}`);
}

export async function updateProfile(payload: {
  name?: string;
  goal?: Profile["goal"];
  targets?: Targets;
}): Promise<Profile> {
  const data = await request<{ profile: Profile }>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return data.profile;
}

export async function analyzeImage(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("image", file, file.name || "meal.jpg");
  return request<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: form
  });
}

export async function saveMeal(payload: CreateMealInput): Promise<Meal> {
  const data = await request<{ meal: Meal }>("/api/meals", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return data.meal;
}

export async function deleteMeal(id: string): Promise<void> {
  await request<void>(`/api/meals/${id}`, { method: "DELETE" });
}

export async function searchFoods(query: string): Promise<FoodCatalogItem[]> {
  const data = await request<{ foods: FoodCatalogItem[] }>(
    `/api/foods?q=${encodeURIComponent(query)}`
  );
  return data.foods;
}
