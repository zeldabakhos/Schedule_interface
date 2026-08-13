import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const dataPath = path.resolve(process.cwd(), "data", "app-data.json");
const restaurantId = "terrasse-main";

const roles = {
  admin: "Administrator",
  employee: "Employee"
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 120000, 32, "sha256")
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = storedHash.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const hash = crypto
    .pbkdf2Sync(password, salt, 120000, 32, "sha256")
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

function createSeedData() {
  const employees = [
    ["emp-julien", "Julien", "Manager"],
    ["emp-mehssen", "Mehssen", "Server"],
    ["emp-mostafa", "Mostafa", "Kitchen"],
    ["emp-mario", "Mario", "Bar"],
    ["emp-ali-saade", "Ali Saade", "Server"],
    ["emp-rassil", "Rassil", "Host"],
    ["emp-racha", "Racha", "Server"],
    ["emp-laura", "Laura", "Host"],
    ["emp-ali-ahmad", "Ali Ahmad", "Kitchen"],
    ["emp-jad", "Jad", "Bar"],
    ["emp-zelda", "Zelda", "Server"],
    ["emp-assaad", "Assaad", "Kitchen"]
  ].map(([id, name, position]) => ({
    id,
    restaurantId,
    name,
    position,
    phone: "",
    email: ""
  }));

  return {
    restaurants: [{ id: restaurantId, name: "Terrasse" }],
    employees,
    users: [
      {
        id: "user-admin",
        restaurantId,
        employeeId: "emp-julien",
        name: "Terrasse Boss",
        email: "boss@terrasse.local",
        role: "admin",
        passwordHash: hashPassword("boss123")
      },
      {
        id: "user-julien",
        restaurantId,
        employeeId: "emp-julien",
        name: "Julien",
        email: "julien@terrasse.local",
        role: "employee",
        passwordHash: hashPassword("julien123")
      }
    ],
    shifts: [],
    reservations: [],
    sessions: []
  };
}

function normalizeData(data) {
  const seed = createSeedData();

  return {
    restaurants: Array.isArray(data?.restaurants) ? data.restaurants : seed.restaurants,
    employees: Array.isArray(data?.employees) ? data.employees : seed.employees,
    users: Array.isArray(data?.users) ? data.users : seed.users,
    shifts: Array.isArray(data?.shifts) ? data.shifts : [],
    reservations: Array.isArray(data?.reservations) ? data.reservations : [],
    sessions: Array.isArray(data?.sessions) ? data.sessions : []
  };
}

export async function readAppData() {
  try {
    const contents = await readFile(dataPath, "utf8");

    return normalizeData(JSON.parse(contents));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const seed = createSeedData();
    await writeAppData(seed);

    return seed;
  }
}

export async function writeAppData(data) {
  const normalized = normalizeData(data);
  const temporaryPath = `${dataPath}.tmp`;

  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`);
  await rename(temporaryPath, dataPath);

  return normalized;
}

export function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    restaurantId: user.restaurantId,
    employeeId: user.employeeId,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: roles[user.role] || user.role
  };
}

export function requireAdmin(user) {
  if (user?.role !== "admin") {
    const error = new Error("Administrator access required");
    error.status = 403;
    throw error;
  }
}

export function createSession(userId) {
  return {
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date().toISOString()
  };
}

export function isPasswordValid(password, passwordHash) {
  return verifyPassword(password, passwordHash);
}

export function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
