import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const schedulePath = path.resolve(process.cwd(), "data", "schedule.json");

function normalizeSchedule(data) {
  if (!data || !Array.isArray(data.assignments)) {
    return { assignments: [] };
  }

  return { assignments: data.assignments };
}

export async function readSchedule() {
  try {
    const contents = await readFile(schedulePath, "utf8");

    return normalizeSchedule(JSON.parse(contents));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const emptySchedule = { assignments: [] };
    await writeSchedule(emptySchedule.assignments);

    return emptySchedule;
  }
}

export async function writeSchedule(assignments) {
  const schedule = normalizeSchedule({ assignments });
  const temporaryPath = `${schedulePath}.tmp`;

  await mkdir(path.dirname(schedulePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(schedule, null, 2)}\n`);
  await rename(temporaryPath, schedulePath);

  return schedule;
}
