import {
  createId,
  createSession,
  isPasswordValid,
  publicUser,
  readAppData,
  requireAdmin,
  writeAppData
} from "./app-store.mjs";
import { readSchedule, writeSchedule } from "./schedule-store.mjs";

const cookieName = "terrasse_session";
const allowedReservationStatuses = [
  "confirmed",
  "arrived",
  "seated",
  "completed",
  "cancelled",
  "no-show"
];

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function sessionCookie(sessionId) {
  return `${cookieName}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`;
}

function expiredSessionCookie() {
  return `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function getRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body ? JSON.parse(body) : {}));
    request.on("error", reject);
  });
}

async function getSessionUser(request, data) {
  const sessionId = parseCookies(request.headers.cookie)[cookieName];
  const session = data.sessions.find((item) => item.id === sessionId);
  const user = data.users.find((item) => item.id === session?.userId);

  return user || null;
}

function filterRestaurantRecords(records, user) {
  return records.filter((record) => record.restaurantId === user.restaurantId);
}

function getVisibleShifts(data, user) {
  const restaurantShifts = filterRestaurantRecords(data.shifts, user);

  if (user.role === "admin") {
    return restaurantShifts;
  }

  return restaurantShifts.filter((shift) => shift.employeeId === user.employeeId);
}

function serializeBootstrap(data, user) {
  return {
    user: publicUser(user),
    restaurant: data.restaurants.find((item) => item.id === user.restaurantId),
    employees: filterRestaurantRecords(data.employees, user),
    shifts: getVisibleShifts(data, user),
    reservations: filterRestaurantRecords(data.reservations, user)
  };
}

function normalizeShift(input, existing, user) {
  const employeeId = String(input.employeeId || existing?.employeeId || "");
  const start = String(input.start || existing?.start || "");
  const end = String(input.end || existing?.end || "");

  if (!employeeId || !start || !end) {
    const error = new Error("Employee, start time, and end time are required");
    error.status = 400;
    throw error;
  }

  return {
    id: existing?.id || createId("shift"),
    restaurantId: user.restaurantId,
    employeeId,
    day: Number(input.day ?? existing?.day ?? 0),
    week: Number(input.week ?? existing?.week ?? 0),
    shift: String(input.shift || existing?.shift || "soir"),
    start,
    end,
    position: String(input.position ?? existing?.position ?? ""),
    note: String(input.note ?? existing?.note ?? "")
  };
}

function normalizeReservation(input, existing, user) {
  const status = String(input.status || existing?.status || "confirmed");

  if (!allowedReservationStatuses.includes(status)) {
    const error = new Error("Invalid reservation status");
    error.status = 400;
    throw error;
  }

  const customerName = String(input.customerName || existing?.customerName || "").trim();
  const date = String(input.date || existing?.date || "");
  const time = String(input.time || existing?.time || "");
  const guests = Number(input.guests ?? existing?.guests ?? 0);
  const phone = String(input.phone || existing?.phone || "").trim();

  if (!customerName || !date || !time || !guests || !phone) {
    const error = new Error("Customer name, date, time, guests, and phone are required");
    error.status = 400;
    throw error;
  }

  return {
    id: existing?.id || createId("reservation"),
    restaurantId: user.restaurantId,
    customerName,
    date,
    time,
    guests,
    phone,
    email: String(input.email ?? existing?.email ?? ""),
    table: String(input.table ?? existing?.table ?? ""),
    notes: String(input.notes ?? existing?.notes ?? ""),
    status
  };
}

async function handleLogin(request, response) {
  const body = await getRequestBody(request);
  const data = await readAppData();
  const user = data.users.find(
    (item) => item.email.toLowerCase() === String(body.email || "").toLowerCase()
  );

  if (!user || !isPasswordValid(String(body.password || ""), user.passwordHash)) {
    sendJson(response, 401, { error: "Invalid email or password" });
    return;
  }

  const session = createSession(user.id);
  data.sessions = [...data.sessions.filter((item) => item.userId !== user.id), session];
  await writeAppData(data);
  sendJson(response, 200, serializeBootstrap(data, user), {
    "Set-Cookie": sessionCookie(session.id)
  });
}

async function handleAuthenticated(request, response, callback) {
  const data = await readAppData();
  const user = await getSessionUser(request, data);

  if (!user) {
    sendJson(response, 401, { error: "Authentication required" });
    return;
  }

  await callback(data, user);
}

function getRoute(pathname, basePath) {
  if (pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }

  if (pathname.startsWith("/api")) {
    return pathname.slice("/api".length) || "/";
  }

  return pathname;
}

async function handleLogout(request, response) {
  const data = await readAppData();
  const sessionId = parseCookies(request.headers.cookie)[cookieName];

  if (sessionId) {
    data.sessions = data.sessions.filter((item) => item.id !== sessionId);
    await writeAppData(data);
  }

  sendJson(response, 200, { ok: true }, { "Set-Cookie": expiredSessionCookie() });
}

export async function handleApiRequest(request, response, basePath = "/api") {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const route = getRoute(url.pathname, basePath);

  try {
    if (route === "/schedule" && request.method === "GET") {
      await handleAuthenticated(request, response, async () => {
        sendJson(response, 200, await readSchedule());
      });
      return;
    }

    if (route === "/schedule" && request.method === "PUT") {
      await handleAuthenticated(request, response, async (data, user) => {
        requireAdmin(user);
        const body = await getRequestBody(request);
        sendJson(response, 200, await writeSchedule(body.assignments));
      });
      return;
    }

    if (route === "/login" && request.method === "POST") {
      await handleLogin(request, response);
      return;
    }

    if (route === "/logout" && request.method === "POST") {
      await handleLogout(request, response);
      return;
    }

    await handleAuthenticated(request, response, async (data, user) => {
      if (route === "/me" && request.method === "GET") {
        sendJson(response, 200, serializeBootstrap(data, user));
        return;
      }

      if (route === "/shifts" && request.method === "POST") {
        requireAdmin(user);
        const body = await getRequestBody(request);
        const shift = normalizeShift(body, null, user);
        data.shifts = [...data.shifts, shift];
        await writeAppData(data);
        sendJson(response, 200, { shift });
        return;
      }

      if (route.startsWith("/shifts/")) {
        requireAdmin(user);
        const shiftId = route.split("/").at(-1);
        const existing = data.shifts.find(
          (item) => item.id === shiftId && item.restaurantId === user.restaurantId
        );

        if (!existing) {
          sendJson(response, 404, { error: "Shift not found" });
          return;
        }

        if (request.method === "PUT") {
          const body = await getRequestBody(request);
          const shift = normalizeShift(body, existing, user);
          data.shifts = data.shifts.map((item) => (item.id === shiftId ? shift : item));
          await writeAppData(data);
          sendJson(response, 200, { shift });
          return;
        }

        if (request.method === "DELETE") {
          data.shifts = data.shifts.filter((item) => item.id !== shiftId);
          await writeAppData(data);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      if (route === "/reservations" && request.method === "POST") {
        requireAdmin(user);
        const body = await getRequestBody(request);
        const reservation = normalizeReservation(body, null, user);
        data.reservations = [...data.reservations, reservation];
        await writeAppData(data);
        sendJson(response, 200, { reservation });
        return;
      }

      if (route.startsWith("/reservations/")) {
        requireAdmin(user);
        const reservationId = route.split("/").at(-1);
        const existing = data.reservations.find(
          (item) => item.id === reservationId && item.restaurantId === user.restaurantId
        );

        if (!existing) {
          sendJson(response, 404, { error: "Reservation not found" });
          return;
        }

        if (request.method === "PUT") {
          const body = await getRequestBody(request);
          const reservation = normalizeReservation(body, existing, user);
          data.reservations = data.reservations.map((item) =>
            item.id === reservationId ? reservation : item
          );
          await writeAppData(data);
          sendJson(response, 200, { reservation });
          return;
        }

        if (request.method === "DELETE") {
          data.reservations = data.reservations.filter((item) => item.id !== reservationId);
          await writeAppData(data);
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      sendJson(response, 404, { error: "Not found" });
    });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message });
  }
}
