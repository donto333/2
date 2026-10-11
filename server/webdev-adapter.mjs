import { createRequire as createCityRoutesRequire } from 'node:module';
const cityRoutes = createCityRoutesRequire(import.meta.url)('./city-routes.json');
// starters/web-db-user-v1/shared/const.ts
var COOKIE_NAME = "webdev_app_session";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// starters/web-db-user-v1/server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// starters/web-db-user-v1/server/db.ts
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// starters/web-db-user-v1/drizzle/schema.ts
import { int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var gameAccountStates = mysqlTable("game_account_states", {
  userId: int("userId").primaryKey(),
  honor: int("honor").default(2480).notNull(),
  silver: int("silver").default(12500).notNull(),
  gold: int("gold").default(0).notNull(),
  manuals: int("manuals").default(180).notNull(),
  wins: int("wins").default(7).notNull(),
  battleScore: int("battleScore").default(18460).notNull(),
  grain: int("grain").default(18200).notNull(),
  wood: int("wood").default(8200).notNull(),
  iron: int("iron").default(3900).notNull(),
  influence: int("influence").default(2480).notNull(),
  faction: mysqlEnum("faction", ["촉한", "위나라", "오나라"]).default("촉한").notNull(),
  factionChosen: int("factionChosen").default(0).notNull(),
  factionWarScore: int("factionWarScore").default(0).notNull(),
  luoyangBoxes: int("luoyangBoxes").default(0).notNull(),
  lastLuoyangReward: int("lastLuoyangReward"),
  luoyangRewardWeekKey: varchar("luoyangRewardWeekKey", { length: 16 }),
  mythicFragments: int("mythicFragments").default(0).notNull(),
  duelAttemptsToday: int("duelAttemptsToday").default(0).notNull(),
  duelDayKey: varchar("duelDayKey", { length: 16 }),
  prelaunchGoldDayKey: varchar("prelaunchGoldDayKey", { length: 16 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  generalData: mediumtext("generalData"),
  formationData: mediumtext("formationData"),
  citiesData: mediumtext("citiesData"),
  researchData: mediumtext("researchData"),
  equipmentData: mediumtext("equipmentData"),
  equipmentLoadoutsData: mediumtext("equipmentLoadoutsData"),
  selectedEquipmentGeneralId: varchar("selectedEquipmentGeneralId", { length: 64 }),
  selectedCityId: varchar("selectedCityId", { length: 64 }),
  incomeCollectedAt: varchar("incomeCollectedAt", { length: 32 }),
  conquestAt: varchar("conquestAt", { length: 32 }),
  scenarioData: mediumtext("scenarioData")
});
var factionTerritoryStates = mysqlTable("faction_territory_states", {
  cityId: varchar("cityId", { length: 64 }).primaryKey(),
  owner: mysqlEnum("owner", ["촉한", "위나라", "오나라", "중립"]).notNull(),
  conquestProgress: int("conquestProgress").default(0).notNull(),
  defense: int("defense").default(10000).notNull(),
  prosperity: int("prosperity").default(50).notNull(),
  version: int("version").default(1).notNull(),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var factionTerritoryAiState = mysqlTable("faction_territory_ai_state", {
  id: int("id").primaryKey(),
  lastTickAt: timestamp("lastTickAt")
});
var luoyangWeeklyResults = mysqlTable("luoyang_weekly_results", {
  weekKey: varchar("weekKey", { length: 16 }).primaryKey(),
  winnerFaction: mysqlEnum("winnerFaction", ["촉한", "위나라", "오나라"]),
  settledAt: timestamp("settledAt").defaultNow().notNull()
});

// starters/web-db-user-v1/server/_core/env.ts
var ENV = {
  get appId() {
    return process.env.MANUS_PROJECT_ID ?? "";
  },
  get cookieSecret() {
    return process.env.MANUS_JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.MANUS_OAUTH_API_URL ?? "";
  },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get adminEmail() {
    return "donto333@gmail.com";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.MANUS_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.MANUS_API_KEY ?? "";
  }
};

// starters/web-db-user-v1/server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId || user.email?.trim().toLowerCase() === ENV.adminEmail) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateUserName(openId, name) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  await db.update(users).set({ name }).where(eq(users.openId, openId));
  return getUserByOpenId(openId);
}
async function listUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(users).limit(200);
}
async function updateUserRole(id, role, actorOpenId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const target = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target[0]) return void 0;
  if (target[0].openId === actorOpenId && role !== "admin") throw new Error("현재 관리자 계정의 관리자 권한은 스스로 해제할 수 없습니다.");
  await db.update(users).set({ role }).where(eq(users.id, id));
  return getUserByOpenId(target[0].openId);
}
const defaultGameState = { honor: 2480, silver: 12500, gold: 0, manuals: 180, wins: 7, battleScore: 18460, grain: 18200, wood: 8200, iron: 3900, influence: 2480, faction: "촉한", factionChosen: 0 };
const CITY_DEFENSE_BY_LEVEL = { 1: 10000, 2: 20000, 3: 50000, 4: 100000, 5: 1000000 };
const TERRITORY_TEST_WEAKENING_ENABLED = true;
const TERRITORY_TEST_WEAKENING_RATIO = 0.1;
function cityDefenseFloor(cityId) {
  const level = CITY_LEVEL_BY_ID[cityId] ?? 5;
  return 0;
}
function legacyCityDefenseFloor(cityId) {
  const level = CITY_LEVEL_BY_ID[cityId] ?? 5;
  return Math.ceil((CITY_DEFENSE_BY_LEVEL[level] ?? CITY_DEFENSE_BY_LEVEL[5]) * TERRITORY_TEST_WEAKENING_RATIO);
}
const CITY_LEVEL_BY_ID = {
  chengdu: 3, hanzhong: 2, xiangyang: 4, jianye: 3, xuchang: 3, luoyang: 5, ye: 4, chenliu: 2, puyang: 2, wancheng: 2,
  jiangling: 3, yiling: 2, changsha: 3, lingling: 1, guiyang: 1, wujun: 3, kuaiji: 2, poyang: 2, hefei: 3, shouchun: 3,
  jiujiang: 2, tianshui: 2, wuwei: 1, fucheng: 2, xindu: 1, changan: 4, meixian: 2, anding: 2, jinyang: 3, pingyuan: 2,
  beihai: 2, langya: 2, xiapi: 3, guangling: 2, lujiang: 2, shangyong: 2, xinye: 2, jiangxia: 2, wuling: 1, badong: 2,
  jianning: 1, yunnan: 1, jiaozhi: 1, shixing: 1, nanhai: 1
};
function cityDefenseForLevel(level) { return CITY_DEFENSE_BY_LEVEL[level] ?? CITY_DEFENSE_BY_LEVEL[5]; }
const FACTION_TERRITORY_SEED = [
  ["chengdu", "촉한", 74, 82], ["hanzhong", "중립", 86, 64], ["xiangyang", "중립", 62, 58], ["jianye", "오나라", 70, 76], ["xuchang", "중립", 81, 79],
  ["luoyang", "중립", 92, 88], ["ye", "위나라", 86, 84], ["chenliu", "중립", 57, 61], ["puyang", "중립", 64, 58], ["wancheng", "중립", 70, 67],
  ["jiangling", "중립", 76, 73], ["yiling", "중립", 68, 55], ["changsha", "중립", 63, 71], ["lingling", "중립", 46, 49], ["guiyang", "중립", 52, 45],
  ["wujun", "중립", 73, 78], ["kuaiji", "중립", 66, 69], ["poyang", "중립", 59, 62], ["hefei", "중립", 88, 64], ["shouchun", "중립", 79, 68],
  ["jiujiang", "중립", 55, 57], ["tianshui", "중립", 71, 53], ["wuwei", "중립", 61, 42], ["fucheng", "중립", 58, 51], ["xindu", "중립", 49, 47],
  ["changan", "중립", 88, 86], ["meixian", "중립", 64, 55], ["anding", "중립", 62, 48], ["jinyang", "중립", 75, 63], ["pingyuan", "중립", 58, 59],
  ["beihai", "중립", 60, 61], ["langya", "중립", 63, 57], ["xiapi", "중립", 72, 70], ["guangling", "중립", 61, 65], ["lujiang", "중립", 66, 60],
  ["shangyong", "중립", 70, 52], ["xinye", "중립", 59, 58], ["jiangxia", "중립", 65, 64], ["wuling", "중립", 50, 46], ["badong", "중립", 67, 50],
  ["jianning", "중립", 54, 42], ["yunnan", "중립", 52, 39], ["jiaozhi", "중립", 48, 44], ["shixing", "중립", 47, 41], ["nanhai", "중립", 45, 43]
].map(([cityId, owner, _legacyDefense, prosperity]) => ({ cityId, owner, conquestProgress: 0, defense: cityDefenseForLevel(CITY_LEVEL_BY_ID[cityId]), prosperity, version: 1 }));
const FACTION_TERRITORY_IDS = new Set(FACTION_TERRITORY_SEED.map(city => city.cityId));
const NEUTRAL_AI_TICK_MS = 10 * 60 * 1000;
const PROTECTED_CAPITAL_IDS = new Set(["chengdu", "ye", "jianye"]);
const LUOYANG_CITY_ID = "luoyang";
// 도시 진군로: server/city-routes.json(클라이언트와 같은 원본)에서 양방향 인접 목록을 만든다.
const CITY_ADJACENCY = (() => {
  const map = {};
  for (const id of cityRoutes.isolated ?? []) map[id] = [];
  for (const [a, b] of cityRoutes.edges) {
    (map[a] ??= []).push(b);
    (map[b] ??= []).push(a);
  }
  return map;
})();
function luoyangSeoulParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), hour: Number(value.hour), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday) };
}
function isLuoyangWindowOpen(now = Date.now()) {
  const parts = luoyangSeoulParts(now);
  return parts.weekday === 0 && parts.hour >= 20 && parts.hour < 24;
}
function luoyangSettledWeekKey(now = Date.now()) {
  const parts = luoyangSeoulParts(now);
  const previousSunday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - (parts.weekday === 0 ? 7 : parts.weekday)));
  return previousSunday.toISOString().slice(0, 10);
}
function parseStateJson(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function gameStateView(row) {
  const { generalData, formationData, citiesData, researchData, equipmentData, equipmentLoadoutsData, scenarioData, ...base } = row;
  return {
    ...base,
    generals: parseStateJson(generalData),
    formation: parseStateJson(formationData),
    cities: parseStateJson(citiesData),
    research: parseStateJson(researchData),
    equipmentInventory: parseStateJson(equipmentData),
    equipmentLoadouts: parseStateJson(equipmentLoadoutsData),
    scenarioCleared: parseStateJson(scenarioData),
    selectedEquipmentGeneralId: row.selectedEquipmentGeneralId ?? null,
    selectedCityId: row.selectedCityId ?? null,
    lastIncomeCollectedAt: row.incomeCollectedAt ? Number(row.incomeCollectedAt) : undefined,
    lastConquestAt: row.conquestAt ? Number(row.conquestAt) : undefined
  };
}
async function getGameState(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  return gameStateView(result[0] ?? { userId, ...defaultGameState, updatedAt: new Date() });
}
function factionTerritoryView(row) {
  return {
    cityId: row.cityId,
    owner: row.owner,
    conquestProgress: Math.max(0, Math.min(100, Number(row.conquestProgress) || 0)),
    defense: Math.max(0, Math.min(CITY_DEFENSE_BY_LEVEL[5], Number(row.defense) || 0)),
    prosperity: Math.max(0, Math.min(100, Number(row.prosperity) || 0)),
    version: Number(row.version) || 1,
    updatedAt: row.updatedAt
  };
}
async function ensureFactionTerritories(db) {
  const existing = await db.select({ cityId: factionTerritoryStates.cityId, defense: factionTerritoryStates.defense, conquestProgress: factionTerritoryStates.conquestProgress }).from(factionTerritoryStates);
  const known = new Set(existing.map(row => row.cityId));
  const missing = FACTION_TERRITORY_SEED.filter(city => !known.has(city.cityId)).map(city => ({ ...city, defense: cityDefenseForLevel(CITY_LEVEL_BY_ID[city.cityId] ?? 1) }));
  if (missing.length) {
    await db.insert(factionTerritoryStates).values(missing).onDuplicateKeyUpdate({ set: { cityId: sql`cityId` } });
  }
  for (const row of existing) {
    const floor = legacyCityDefenseFloor(row.cityId);
    // 이전 버전이 모든 도시를 약화 하한에서 시작시킨 경우만 원래 최대치로 복구한다.
    // 이미 공성 진전이 있는 도시는 현재 방어도를 그대로 보존한다.
    if (Number(row.defense) === floor && Number(row.conquestProgress) === 0) {
      await db.update(factionTerritoryStates).set({ defense: cityDefenseForLevel(CITY_LEVEL_BY_ID[row.cityId] ?? 1) }).where(eq(factionTerritoryStates.cityId, row.cityId));
    }
  }
}
async function advanceNeutralTerritoryAi(db, now = Date.now()) {
  const shouldTick = await db.transaction(async tx => {
    const rows = await tx.select().from(factionTerritoryAiState).where(eq(factionTerritoryAiState.id, 1)).limit(1).for("update");
    const current = rows[0];
    const lastTick = current?.lastTickAt ? new Date(current.lastTickAt).getTime() : 0;
    if (current && now - lastTick < NEUTRAL_AI_TICK_MS) return false;
    if (current) await tx.update(factionTerritoryAiState).set({ lastTickAt: new Date(now) }).where(eq(factionTerritoryAiState.id, 1));
    else await tx.insert(factionTerritoryAiState).values({ id: 1, lastTickAt: new Date(now) });
    return true;
  });
  if (!shouldTick) return 0;
  const rows = await db.select().from(factionTerritoryStates);
  const byCityId = new Map(rows.map(row => [row.cityId, row]));
  const attacks = [];
  for (const attacker of rows.filter(row => row.owner === "중립")) {
    const target = (CITY_ADJACENCY[attacker.cityId] ?? [])
      .map(cityId => byCityId.get(cityId))
      .filter(row => row && row.owner !== "중립" && !PROTECTED_CAPITAL_IDS.has(row.cityId))
      .sort((left, right) => Number(left.defense) - Number(right.defense))[0];
    if (target) attacks.push({ attacker: attacker.cityId, target: target.cityId });
  }
  if (!attacks.length) return 0;
  await db.transaction(async tx => {
    for (const attack of attacks) {
      const locked = await tx.select().from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, attack.target)).limit(1).for("update");
      const target = locked[0];
      if (!target || target.owner === "중립" || PROTECTED_CAPITAL_IDS.has(target.cityId)) continue;
      const damage = 900 + (CITY_LEVEL_BY_ID[attack.attacker] ?? 1) * 500;
      const defense = Math.max(0, Number(target.defense) - damage);
      const captured = defense <= 0;
      await tx.update(factionTerritoryStates).set({
        owner: captured ? "중립" : target.owner,
        conquestProgress: captured ? 0 : Math.min(100, Number(target.conquestProgress) + damage),
        defense: captured ? cityDefenseForLevel(CITY_LEVEL_BY_ID[target.cityId]) : defense,
        prosperity: captured ? Math.max(25, Number(target.prosperity) - 15) : Math.max(20, Number(target.prosperity) - 3),
        version: sql`${factionTerritoryStates.version} + 1`,
        updatedByUserId: null
      }).where(eq(factionTerritoryStates.cityId, target.cityId));
    }
  });
  return attacks.length;
}
async function settleLuoyangWeek(db, now = Date.now()) {
  const weekKey = luoyangSettledWeekKey(now);
  const existing = await db.select().from(luoyangWeeklyResults).where(eq(luoyangWeeklyResults.weekKey, weekKey)).limit(1);
  if (existing[0]) return { weekKey, winnerFaction: existing[0].winnerFaction };
  const city = await db.select({ owner: factionTerritoryStates.owner }).from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, LUOYANG_CITY_ID)).limit(1);
  const winnerFaction = city[0]?.owner && city[0].owner !== "중립" ? city[0].owner : null;
  await db.insert(luoyangWeeklyResults).values({ weekKey, winnerFaction }).onDuplicateKeyUpdate({ set: { weekKey: sql`weekKey` } });
  return { weekKey, winnerFaction };
}
async function grantLuoyangBox(db, userId, now = Date.now()) {
  const settlement = await settleLuoyangWeek(db, now);
  if (!settlement.winnerFaction) return false;
  return db.transaction(async tx => {
    const rows = await tx.select().from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1).for("update");
    const account = rows[0];
    if (!account || account.faction !== settlement.winnerFaction || account.luoyangRewardWeekKey === settlement.weekKey) return false;
    const reward = 10 + Math.floor(Math.random() * 91);
    await tx.update(gameAccountStates).set({ luoyangBoxes: sql`${gameAccountStates.luoyangBoxes} + 1`, lastLuoyangReward: reward, gold: sql`${gameAccountStates.gold} + ${reward}`, luoyangRewardWeekKey: settlement.weekKey }).where(eq(gameAccountStates.userId, userId));
    return true;
  });
}
async function getFactionTerritories(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureFactionTerritories(db);
  await advanceNeutralTerritoryAi(db);
  if (userId) await grantLuoyangBox(db, userId);
  const rows = await db.select().from(factionTerritoryStates);
  const byCityId = new Map(rows.map(row => [row.cityId, row]));
  return FACTION_TERRITORY_SEED.map(city => factionTerritoryView(byCityId.get(city.cityId) ?? city));
}
async function recordFactionTerritoryBattle(userId, input) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!FACTION_TERRITORY_IDS.has(input.cityId)) throw new Error("해당 도시를 찾을 수 없습니다.");
  await ensureFactionTerritories(db);
  await advanceNeutralTerritoryAi(db);
  if (input.cityId === LUOYANG_CITY_ID && !isLuoyangWindowOpen()) return getFactionTerritories(userId);
  if (!input.won) return getFactionTerritories(userId);
  const account = await db.select({ faction: gameAccountStates.faction }).from(gameAccountStates).where(eq(gameAccountStates.userId, userId)).limit(1);
  const faction = account[0]?.faction ?? "촉한";
  const damage = Math.max(1, Math.min(CITY_DEFENSE_BY_LEVEL[5], Math.trunc(input.damage)));
  await db.transaction(async tx => {
    const rows = await tx.select().from(factionTerritoryStates).where(eq(factionTerritoryStates.cityId, input.cityId)).limit(1).for("update");
    const current = rows[0];
    if (!current || current.owner === faction) return;
    const finalRequested = Boolean(input.captured);
    // The client sends captured=true only after the local final faction battle
    // has passed the zero-defense and garrison checks. Treat that successful
    // final-war result as authoritative even when this shared row is stale
    // from an earlier failed siege sync; otherwise the next list query can
    // overwrite the newly captured city with the old neutral snapshot.
    const captured = finalRequested;
    const conquestProgress = captured ? 100 : Math.min(100, Number(current.conquestProgress) + damage);
    // The row lock makes the first final-war request authoritative.
    // A later concurrent request observes the new owner and is ignored.
    await tx.update(factionTerritoryStates).set({
      owner: captured ? faction : current.owner,
      conquestProgress,
      // A newly captured city starts its next defense cycle at full wall strength.
      // Keeping defense at 0 lets the neutral AI tick capture it back to neutral
      // immediately after the successful final faction battle is synchronized.
      defense: captured ? cityDefenseForLevel(CITY_LEVEL_BY_ID[input.cityId] ?? 1) : Math.max(cityDefenseFloor(input.cityId), Number(current.defense) - damage),
      prosperity: captured ? Math.max(30, Number(current.prosperity) - 20) : current.prosperity,
      version: sql`${factionTerritoryStates.version} + 1`,
      updatedByUserId: userId
    }).where(eq(factionTerritoryStates.cityId, input.cityId));
  });
  return getFactionTerritories(userId);
}
async function listGameStates() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const accounts = await db.select().from(users).limit(200);
  const states = await db.select().from(gameAccountStates);
  const byUser = new Map(states.map(state => [state.userId, state]));
  return accounts.map(user => ({ ...user, ...(byUser.get(user.id) ?? { userId: user.id, ...defaultGameState, updatedAt: new Date() }) }));
}
async function listDuelOpponents(viewerId, limit = 12) {
  const accounts = await listGameStates();
  return accounts.filter(account => account.id !== viewerId).map(account => {
    const generals = parseStateJson(account.generalData);
    const formation = parseStateJson(account.formationData);
    if (!Array.isArray(generals) || !Array.isArray(formation)) return null;
    const byId = new Map(generals.filter(general => general && typeof general.id === 'string').map(general => [general.id, general]));
    const deck = formation.slice(0, 3).map(id => byId.get(id)).filter(Boolean);
    if (!deck.length) return null;
    return {
      id: `user-${account.id}`,
      displayName: account.name || `지휘관 ${account.id}`,
      score: Number.isFinite(Number(account.battleScore)) ? Number(account.battleScore) : 0,
      isDummy: false,
      deck,
    };
  }).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, Math.max(1, Math.min(50, limit)));
}
async function updateGameState(userId, values) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(gameAccountStates).values({ userId, ...values }).onDuplicateKeyUpdate({ set: values });
  // The client already owns the canonical state. Avoid a second full-row read
  // (including large JSON inventories) after every write.
  return { ok: true, userId };
}

// starters/web-db-user-v1/server/_core/cookies.ts
function getSessionCookieOptions(_req) {
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}

// starters/web-db-user-v1/shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
  statusCode;
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// starters/web-db-user-v1/server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured! Set MANUS_OAUTH_API_URL environment variable."
      );
    }
  }
  client;
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) throw new Error("MANUS_JWT_SECRET is unavailable");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || (!isNonEmptyString(appId) || appId !== ENV.appId) || typeof name !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && req.path.startsWith("/api/scheduled/")) {
      const ticket = cookies.get("app_session_id");
      const identity = await this.verifySession(ticket);
      if (identity?.openId.startsWith(CRON_OPEN_ID_PREFIX)) sessionToken = ticket;
    }
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// starters/web-db-user-v1/server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app, { afterLogin } = {}) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      // Steam 데스크톱 앱 로그인(server/desktop-auth.mjs)이면 앱으로 돌려보낸다.
      if (afterLogin && await afterLogin(req, res, { openId: userInfo.openId, name: userInfo.name || "" })) return;
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// starters/web-db-user-v1/server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// starters/web-db-user-v1/server/_core/systemRouter.ts
import { z } from "zod";

// starters/web-db-user-v1/server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// starters/web-db-user-v1/server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.email?.trim().toLowerCase() !== ENV.adminEmail)) {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// starters/web-db-user-v1/server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// starters/web-db-user-v1/server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// starters/web-db-user-v1/server/_core/publicConfig.ts
function publicPlatformConfig(env = process.env) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? ""
  };
}
export {
  ENV,
  OAUTH_STATE_COOKIE,
  ONE_YEAR_MS,
  sdk,
  createContext,
  adminProcedure,
  getDb,
  getGameState,
  getFactionTerritories,
  listDuelOpponents,
  listGameStates,
  listUsers,
  protectedProcedure,
  updateGameState,
  recordFactionTerritoryBattle,
  updateUserRole,
  updateUserName,
  publicPlatformConfig,
  publicProcedure,
  registerOAuthRoutes,
  router,
  appRouter as webdevRouter
};
