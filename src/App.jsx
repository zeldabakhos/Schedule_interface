import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  LogOut,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const shiftSections = [
  {
    id: "matin",
    name: "Service Matin"
  },
  {
    id: "soir",
    name: "Service Soir"
  }
];

const team = ["Julien", "Mehssen", "Mostafa", "Mario", "Ali Saade", "Rassil", "Racha", "Laura", "Ali Ahmad", "Jad", "Zelda", "Assaad"];
const staffPalette = [
  { text: "#16433d", background: "#dff5ee", border: "#35a285" },
  { text: "#5c2f6f", background: "#f3ddff", border: "#b15fd2" },
  { text: "#653718", background: "#ffe8d1", border: "#e38b3f" },
  { text: "#173c67", background: "#e3f0ff", border: "#4f8fd8" },
  { text: "#7c2d12", background: "#ffddd2", border: "#f26b3d" },
  { text: "#41551a", background: "#edf7c9", border: "#8fae3f" },
  { text: "#6b4b00", background: "#fff3c4", border: "#e4b82f" },
  { text: "#0d4b67", background: "#d9f5ff", border: "#35a6c8" },
  { text: "#4f255f", background: "#ead9f4", border: "#8f55a8" },
  { text: "#2f4a25", background: "#dfefd9", border: "#6a9f5b" },
  { text: "#7b3155", background: "#ffe4f0", border: "#ef9bc2" },
  { text: "#194061", background: "#e0f2fe", border: "#3b82b6" }
];

const initialAssignments = [];
const assignmentsStorageKey = "terrasse-schedule-assignments";
const timePattern = /^\d{2}:\d{2}$/;
const matinShiftLatestStart = "18:00";
const endingOptionsByShift = {
  matin: [
    { value: "fin de service", label: "Fin de service" }
  ],
  soir: [
    { value: "fermeture", label: "Fermeture" },
    { value: "fin de service", label: "Fin de service" }
  ]
};

function isAtOrAfter(time, threshold) {
  return time >= threshold;
}

function getShiftRuleError(shift, start) {
  if (shift === "matin" && isAtOrAfter(start, matinShiftLatestStart)) {
    return "Matin shift starts must be before 18:00.";
  }

  return "";
}

function getValidEndMode(shift, endMode) {
  if (shift === "matin" && endMode === "custom") {
    return endMode;
  }

  const options = endingOptionsByShift[shift];

  if (options.some((option) => option.value === endMode)) {
    return endMode;
  }

  return options[0].value;
}

function getStaffPaletteIndex(staff) {
  const index = team.indexOf(staff);

  return index >= 0 ? index % staffPalette.length : 0;
}

function getStaffColorClass(staff) {
  return `staff-color-${getStaffPaletteIndex(staff)}`;
}

function loadStoredAssignments() {
  try {
    const storedAssignments = window.localStorage.getItem(assignmentsStorageKey);

    return storedAssignments ? JSON.parse(storedAssignments) : initialAssignments;
  } catch {
    return initialAssignments;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getStaffPalette(staff) {
  return staffPalette[getStaffPaletteIndex(staff)];
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawText(context, text, x, y, maxWidth) {
  let output = text;

  while (context.measureText(output).width > maxWidth && output.length > 3) {
    output = output.slice(0, -2);
  }

  context.fillText(output === text ? output : `${output}...`, x, y);
}

async function loadPersistedAssignments() {
  const response = await fetch("/api/schedule");

  if (!response.ok) {
    throw new Error("Could not load schedule");
  }

  const data = await response.json();

  return Array.isArray(data.assignments) ? data.assignments : initialAssignments;
}

async function savePersistedAssignments(assignments) {
  const response = await fetch("/api/schedule", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ assignments })
  });

  if (!response.ok) {
    throw new Error("Could not save schedule");
  }
}

function EndingOptions({
  name,
  shift,
  endMode,
  endTime,
  onEndModeChange,
  onEndTimeChange
}) {
  return (
    <fieldset>
      <legend>Ending</legend>
      {endingOptionsByShift[shift].map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={endMode === option.value}
            onChange={(event) => onEndModeChange(event.target.value)}
          />
          {option.label}
        </label>
      ))}
      {shift === "matin" && (
        <label className="ending-time direct-ending-time">
          <input
            type="time"
            aria-label="Specific ending hour"
            value={endTime}
            onChange={(event) => {
              onEndModeChange("custom");
              onEndTimeChange(event.target.value);
            }}
          />
        </label>
      )}
    </fieldset>
  );
}

function ScheduleApp({ canEdit = true }) {
  const [assignments, setAssignments] = useState(loadStoredAssignments);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState({ day: 0, shift: "soir" });
  const [repeatDays, setRepeatDays] = useState([0]);
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [formError, setFormError] = useState("");
  const [hasLoadedDiskStorage, setHasLoadedDiskStorage] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Loading saved schedule...");
  const [selectedStaffFilters, setSelectedStaffFilters] = useState([]);
  const [draft, setDraft] = useState({
    staff: team[0],
    start: "18:00",
    end: "fermeture",
    endTime: "23:00"
  });

  const days = weekDays.map((label, index) => ({ key: index, label }));
  const weekLabel = "Monday - Sunday";
  const selectedShift = shiftSections.find((shift) => shift.id === selectedSlot.shift);
  const selectedAssignments = assignments.filter(
    (assignment) =>
      assignment.week === weekOffset &&
      assignment.day === selectedSlot.day &&
      assignment.shift === selectedSlot.shift &&
      matchesStaffFilter(assignment)
  );
  const isEditing = editingAssignmentId !== null;

  useEffect(() => {
    let shouldIgnore = false;

    loadPersistedAssignments()
      .then((savedAssignments) => {
        if (shouldIgnore) {
          return;
        }

        const browserBackup = loadStoredAssignments();
        const assignmentsToUse =
          savedAssignments.length === 0 && browserBackup.length > 0
            ? browserBackup
            : savedAssignments;

        setAssignments(assignmentsToUse);
        window.localStorage.setItem(
          assignmentsStorageKey,
          JSON.stringify(assignmentsToUse)
        );
        setStorageStatus("Saved to data/schedule.json");
      })
      .catch(() => {
        if (!shouldIgnore) {
          setStorageStatus("Using browser backup only");
        }
      })
      .finally(() => {
        if (!shouldIgnore) {
          setHasLoadedDiskStorage(true);
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedDiskStorage || !canEdit) {
      return;
    }

    window.localStorage.setItem(
      assignmentsStorageKey,
      JSON.stringify(assignments)
    );

    savePersistedAssignments(assignments)
      .then(() => setStorageStatus("Saved to data/schedule.json"))
      .catch(() => setStorageStatus("Using browser backup only"));
  }, [assignments, canEdit, hasLoadedDiskStorage]);

  function getAssignments(day, shift) {
    return assignments.filter(
      (assignment) =>
        assignment.week === weekOffset &&
        assignment.day === day &&
        assignment.shift === shift &&
        matchesStaffFilter(assignment)
    );
  }

  function matchesStaffFilter(assignment) {
    return (
      selectedStaffFilters.length === 0 ||
      selectedStaffFilters.includes(assignment.staff)
    );
  }

  function toggleStaffFilter(staff) {
    setSelectedStaffFilters((current) => {
      if (current.includes(staff)) {
        return current.filter((item) => item !== staff);
      }

      return [...current, staff];
    });
  }

  function hasStaffConflict({ week, day, shift, staff, ignoredId = null }) {
    return assignments.some(
      (assignment) =>
        assignment.id !== ignoredId &&
        assignment.week === week &&
        assignment.day === day &&
        assignment.shift === shift &&
        assignment.staff === staff
    );
  }

  function getRepeatConflictMessage(targetDays, staff, shift, ignoredId = null) {
    const conflictingDays = targetDays.filter((day) =>
      hasStaffConflict({
        week: weekOffset,
        day,
        shift,
        staff,
        ignoredId
      })
    );

    if (conflictingDays.length === 0) {
      return "";
    }

    const dayLabels = conflictingDays
      .map((day) => days.find((item) => item.key === day)?.label)
      .join(", ");

    return `${staff} already has a slot in this shift on ${dayLabels}.`;
  }

  function handleExportPdf() {
    if (!canEdit) {
      return;
    }

    document.title = "Terrasse weekly schedule";
    window.print();
  }

  async function handleExportJpg() {
    if (!canEdit) {
      return;
    }

    const filename = "terrasse-weekly-schedule.jpg";
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const width = 1800;
    const headerHeight = 86;
    const leftColumnWidth = 190;
    const cellWidth = (width - leftColumnWidth) / days.length;
    const rowPadding = 16;
    const cardHeight = 54;
    const rowHeights = shiftSections.map((shift) => {
      const maxAssignments = Math.max(
        1,
        ...days.map((day) => getAssignments(day.key, shift.id).length)
      );

      return Math.max(150, 74 + maxAssignments * (cardHeight + 10));
    });
    const height = headerHeight + rowHeights.reduce((total, item) => total + item, 0);

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#f8f9fb";
    context.fillRect(0, 0, width, headerHeight);
    context.strokeStyle = "#dfe3de";
    context.lineWidth = 2;
    context.strokeRect(0, 0, width, height);
    context.fillStyle = "#1f2933";
    context.font = "700 30px Arial";
    context.fillText("Weekly staffing schedule", 24, 42);
    context.font = "700 18px Arial";
    context.fillStyle = "#667085";
    context.fillText("Monday - Sunday", 24, 68);

    days.forEach((day, index) => {
      const x = leftColumnWidth + index * cellWidth;

      context.fillStyle = "#2f3541";
      context.font = "800 22px Arial";
      context.fillText(day.label, x + 16, 55);
      context.strokeStyle = "#e7e9ee";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    });

    let rowTop = headerHeight;

    shiftSections.forEach((shift, shiftIndex) => {
      const rowHeight = rowHeights[shiftIndex];

      context.fillStyle = "#fbfbfc";
      context.fillRect(0, rowTop, leftColumnWidth, rowHeight);
      context.strokeStyle = "#e7e9ee";
      context.strokeRect(0, rowTop, width, rowHeight);
      context.fillStyle = "#1f2933";
      context.font = "800 22px Arial";
      context.fillText(shift.name, 18, rowTop + 36);

      days.forEach((day, dayIndex) => {
        const cellLeft = leftColumnWidth + dayIndex * cellWidth;
        const cellAssignments = getAssignments(day.key, shift.id);

        cellAssignments.forEach((assignment, assignmentIndex) => {
          const palette = getStaffPalette(assignment.staff);
          const cardX = cellLeft + rowPadding;
          const cardY = rowTop + rowPadding + assignmentIndex * (cardHeight + 10);
          const cardW = cellWidth - rowPadding * 2;

          context.fillStyle = palette.background;
          roundRect(context, cardX, cardY, cardW, cardHeight, 10);
          context.fill();
          context.fillStyle = palette.border;
          roundRect(context, cardX, cardY, 6, cardHeight, 3);
          context.fill();
          context.fillStyle = palette.text;
          context.font = "800 17px Arial";
          drawText(context, assignment.staff, cardX + 14, cardY + 23, cardW - 24);
          context.font = "600 14px Arial";
          drawText(
            context,
            `${assignment.start} - ${assignment.end}`,
            cardX + 14,
            cardY + 43,
            cardW - 24
          );
        });
      });

      rowTop += rowHeight;
    });

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.95);
    });

    if (!blob) {
      return;
    }

    const file = new File([blob], filename, { type: "image/jpeg" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "Terrasse weekly schedule",
        files: [file]
      });
      return;
    }

    downloadBlob(blob, filename);
  }

  function changeWeek(direction) {
    setWeekOffset((current) => current + direction);
    setSelectedSlot((current) => ({ ...current, day: 0 }));
    setRepeatDays([0]);
    cancelEdit();
  }

  function selectSlot(day, shift, shouldOpenEditor = false) {
    setSelectedSlot({ day, shift });

    if (!isEditing) {
      setRepeatDays([day]);
    }

    if (shouldOpenEditor && canEdit) {
      setIsMobileEditorOpen(true);
    }
  }

  function startEditAssignment(assignment, shouldOpenEditor = false) {
    if (!canEdit) {
      return;
    }

    setSelectedSlot({ day: assignment.day, shift: assignment.shift });
    setRepeatDays([assignment.day]);
    setEditingAssignmentId(assignment.id);
    setFormError("");
    setDraft({
      staff: assignment.staff,
      start: assignment.start,
      end: timePattern.test(assignment.end) ? "custom" : assignment.end,
      endTime: timePattern.test(assignment.end) ? assignment.end : "15:00"
    });

    if (shouldOpenEditor) {
      setIsMobileEditorOpen(true);
    }
  }

  function cancelEdit() {
    setEditingAssignmentId(null);
    setRepeatDays([selectedSlot.day]);
    setFormError("");
    setDraft({
      staff: team[0],
      start: selectedSlot.shift === "matin" ? "10:00" : "18:00",
      end: selectedSlot.shift === "matin" ? "fin de service" : "fermeture",
      endTime: "15:00"
    });
  }

  function closeMobileEditor() {
    setIsMobileEditorOpen(false);
  }

  function handleSubmitAssignment(event) {
    event.preventDefault();
    if (!canEdit) {
      return;
    }

    const error = getShiftRuleError(selectedSlot.shift, draft.start);

    if (error) {
      setFormError(error);
      return;
    }

    const endMode = getValidEndMode(selectedSlot.shift, draft.end);
    const end = endMode === "custom" ? draft.endTime : endMode;
    const targetDays = isEditing
      ? [selectedSlot.day]
      : repeatDays.length > 0
        ? repeatDays
        : [selectedSlot.day];
    const duplicateError = getRepeatConflictMessage(
      targetDays,
      draft.staff,
      selectedSlot.shift,
      isEditing ? editingAssignmentId : null
    );

    if (duplicateError) {
      setFormError(duplicateError);
      return;
    }

    const assignmentPayload = {
      week: weekOffset,
      day: selectedSlot.day,
      shift: selectedSlot.shift,
      staff: draft.staff,
      start: draft.start,
      end
    };

    setFormError("");

    if (isEditing) {
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.id === editingAssignmentId
            ? { ...assignment, ...assignmentPayload }
            : assignment
        )
      );
      setEditingAssignmentId(null);
      setIsMobileEditorOpen(false);
      return;
    }

    setAssignments((current) => [
      ...current,
      ...targetDays.map((day, index) => ({
        ...assignmentPayload,
        id: Date.now() + index,
        day
      }))
    ]);
    setIsMobileEditorOpen(false);
  }

  function toggleRepeatDay(day) {
    setRepeatDays((current) => {
      if (current.includes(day)) {
        return current.filter((item) => item !== day);
      }

      return [...current, day].sort((first, second) => first - second);
    });
  }

  function handleRemoveAssignment(id) {
    if (!canEdit) {
      return;
    }

    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== id)
    );
    if (editingAssignmentId === id) {
      cancelEdit();
    }
  }

  function clearSchedule() {
    if (!canEdit) {
      return;
    }

    setAssignments([]);
    setEditingAssignmentId(null);
    setPendingDrop(null);
    setIsMobileEditorOpen(false);
    setIsClearConfirmOpen(false);
    cancelEdit();
  }

  function handleDrop(event, day, shift) {
    event.preventDefault();
    if (!canEdit) {
      return;
    }

    const assignmentId = Number(event.dataTransfer.getData("text/plain"));
    const assignment = assignments.find((item) => item.id === assignmentId);

    if (!assignment) {
      return;
    }

    selectSlot(day, shift);
    setPendingDrop({
      assignmentId,
      day,
      shift,
      week: weekOffset,
      sourceShift: assignment.shift,
      start: assignment.start,
      endMode: timePattern.test(assignment.end) ? "custom" : assignment.end,
      endTime: timePattern.test(assignment.end) ? assignment.end : "15:00"
    });
  }

  function completeDrop(action) {
    if (!canEdit) {
      return;
    }

    if (!pendingDrop) {
      return;
    }

    const assignment = assignments.find(
      (item) => item.id === pendingDrop.assignmentId
    );

    if (!assignment) {
      setPendingDrop(null);
      return;
    }

    const endMode = getValidEndMode(pendingDrop.shift, pendingDrop.endMode);
    const end = endMode === "custom" ? pendingDrop.endTime : endMode;
    const error = getShiftRuleError(pendingDrop.shift, pendingDrop.start);

    if (error) {
      setPendingDrop((current) => ({ ...current, error }));
      return;
    }

    const duplicateError = getRepeatConflictMessage(
      [pendingDrop.day],
      assignment.staff,
      pendingDrop.shift,
      action === "move" ? pendingDrop.assignmentId : null
    );

    if (duplicateError) {
      setPendingDrop((current) => ({ ...current, error: duplicateError }));
      return;
    }

    const updatedAssignment = {
      week: pendingDrop.week,
      day: pendingDrop.day,
      shift: pendingDrop.shift,
      start: pendingDrop.start,
      end
    };

    if (action === "move") {
      setAssignments((current) =>
        current.map((item) =>
          item.id === pendingDrop.assignmentId
            ? {
                ...item,
                ...updatedAssignment
              }
            : item
        )
      );
    }

    if (action === "duplicate") {
      setAssignments((current) => [
        ...current,
        {
          ...assignment,
          id: Date.now(),
          ...updatedAssignment
        }
      ]);
    }

    setPendingDrop(null);
  }

  function renderAssignmentEditor() {
    return (
      <>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Selected slot</p>
            <h2>{selectedShift.name}</h2>
          </div>
          <button
            className="secondary-button mobile-editor-close"
            onClick={closeMobileEditor}
            type="button"
          >
            Close
          </button>
        </div>

        {canEdit && (
          <form className="assignment-form" onSubmit={handleSubmitAssignment}>
            {isEditing && <p className="edit-mode-label">Editing shift</p>}
            <label>
              Staff member
              <select
                value={draft.staff}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, staff: event.target.value }))
                }
              >
                {team.map((member) => (
                  <option key={member} value={member}>
                    {member}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starting hour
              <input
                type="time"
                value={draft.start}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, start: event.target.value }))
                }
              />
            </label>
            <EndingOptions
              name="end"
              shift={selectedSlot.shift}
              endMode={getValidEndMode(selectedSlot.shift, draft.end)}
              endTime={draft.endTime}
              onEndModeChange={(value) =>
                setDraft((current) => ({ ...current, end: value }))
              }
              onEndTimeChange={(value) =>
                setDraft((current) => ({ ...current, endTime: value }))
              }
            />
            {!isEditing && (
              <fieldset className="repeat-days">
                <legend>Repeat on</legend>
                {days.map((day) => (
                  <label key={day.key}>
                    <input
                      type="checkbox"
                      checked={repeatDays.includes(day.key)}
                      onChange={() => toggleRepeatDay(day.key)}
                    />
                    {day.label}
                  </label>
                ))}
              </fieldset>
            )}
            <button className="primary-button" type="submit">
              {isEditing ? <Save size={17} /> : <Plus size={17} />}
              {isEditing ? "Save changes" : "Add staff"}
            </button>
            {isEditing && (
              <button
                className="secondary-button"
                type="button"
                onClick={cancelEdit}
              >
                Cancel edit
              </button>
            )}
            {formError && <p className="form-error">{formError}</p>}
          </form>
        )}

        <ul className="assignment-list">
          {selectedAssignments.map((assignment) => (
            <li
              className={
                editingAssignmentId === assignment.id
                  ? "editing-assignment"
                  : ""
              }
              key={assignment.id}
            >
              <button
                className="assignment-edit-button"
                disabled={!canEdit}
                onClick={() => startEditAssignment(assignment)}
              >
                {assignment.staff}
                <small>
                  {assignment.start} - {assignment.end}
                </small>
              </button>
              {canEdit && (
                <button onClick={() => handleRemoveAssignment(assignment.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Owner dashboard</p>
            <h1>Weekly staffing schedule</h1>
            <p className="storage-status">{storageStatus}</p>
          </div>
          <div className="toolbar" aria-label="Schedule actions">
            <button
              className="icon-button"
              aria-label="Previous week"
              onClick={() => changeWeek(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button className="week-button">{weekLabel}</button>
            <button
              className="icon-button"
              aria-label="Next week"
              onClick={() => changeWeek(1)}
            >
              <ChevronRight size={18} />
            </button>
            {canEdit && (
              <div className="export-actions">
                <button
                  className="danger-button"
                  onClick={() => setIsClearConfirmOpen(true)}
                >
                  Clear
                </button>
                <button className="secondary-button" onClick={handleExportPdf}>
                  <Download size={17} />
                  PDF
                </button>
                <button className="primary-button" onClick={handleExportJpg}>
                  <Download size={17} />
                  JPG / Share
                </button>
              </div>
            )}
          </div>
        </header>

        <section className="controls-row employee-filter-panel" aria-label="Employee filters">
          <div>
            <p className="eyebrow">Filter schedule</p>
            <h2>
              {selectedStaffFilters.length === 0
                ? "Full team"
                : `${selectedStaffFilters.length} selected`}
            </h2>
          </div>
          <div className="employee-filter-list">
            {team.map((member) => (
              <label className="employee-filter-chip" key={member}>
                <input
                  type="checkbox"
                  checked={selectedStaffFilters.includes(member)}
                  onChange={() => toggleStaffFilter(member)}
                />
                {member}
              </label>
            ))}
          </div>
          <button
            className="secondary-button"
            disabled={selectedStaffFilters.length === 0}
            onClick={() => setSelectedStaffFilters([])}
            type="button"
          >
            Reset filters
          </button>
        </section>

        <div className="content-grid">
          <section
            className="schedule-board desktop-schedule-board"
            aria-label="Weekly schedule"
          >
            <div className="board-header">
              <span>Shift</span>
              {days.map((day) => (
                <span key={day.key}>
                  <strong>{day.label}</strong>
                </span>
              ))}
            </div>

            {shiftSections.map((shift) => (
              <div className="board-row" key={shift.id}>
                <div className="shift-label">
                  <strong>{shift.name}</strong>
                  <span>{shift.hours}</span>
                </div>
                {days.map((day) => (
                  <div
                    role="button"
                    tabIndex={0}
                    className={
                      selectedSlot.day === day.key && selectedSlot.shift === shift.id
                        ? "calendar-cell selected"
                        : "calendar-cell"
                    }
                    key={`${shift.id}-${day.key}`}
                    onClick={() => selectSlot(day.key, shift.id)}
                    onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                    onDrop={
                      canEdit
                        ? (event) => handleDrop(event, day.key, shift.id)
                        : undefined
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        selectSlot(day.key, shift.id);
                      }
                    }}
                  >
                    <span className="mobile-cell-label">
                      {day.label}
                    </span>
                    {getAssignments(day.key, shift.id).map((assignment) => (
                      <span
                        className={`event-pill ${getStaffColorClass(assignment.staff)} ${
                          editingAssignmentId === assignment.id ? "editing-event" : ""
                        }`}
                        draggable={canEdit}
                        key={assignment.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (canEdit) {
                            startEditAssignment(assignment);
                          }
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copyMove";
                          event.dataTransfer.setData(
                            "text/plain",
                            String(assignment.id)
                          );
                        }}
                      >
                        <strong>{assignment.staff}</strong>
                        <small>
                          {assignment.start} - {assignment.end}
                        </small>
                      </span>
                    ))}
                    {canEdit && (
                      <span className="cell-add">
                        <Plus size={14} />
                        Staff
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="mobile-schedule-board" aria-label="Weekly schedule">
            {days.map((day) => (
              <article className="mobile-day-card" key={day.key}>
                <h2>{day.label}</h2>
                {shiftSections.map((shift) => (
                  <div
                    role="button"
                    tabIndex={0}
                    className={
                      selectedSlot.day === day.key && selectedSlot.shift === shift.id
                        ? "mobile-shift-block selected"
                        : "mobile-shift-block"
                    }
                    key={`${day.key}-${shift.id}`}
                    onClick={() => selectSlot(day.key, shift.id, canEdit)}
                    onDragOver={canEdit ? (event) => event.preventDefault() : undefined}
                    onDrop={
                      canEdit
                        ? (event) => handleDrop(event, day.key, shift.id)
                        : undefined
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                          selectSlot(day.key, shift.id, canEdit);
                      }
                    }}
                  >
                    <span className="mobile-shift-title">{shift.name}</span>
                    {getAssignments(day.key, shift.id).map((assignment) => (
                      <span
                        className={`event-pill ${getStaffColorClass(assignment.staff)} ${
                          editingAssignmentId === assignment.id ? "editing-event" : ""
                        }`}
                        draggable={canEdit}
                        key={assignment.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (canEdit) {
                            startEditAssignment(assignment, true);
                          }
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "copyMove";
                          event.dataTransfer.setData(
                            "text/plain",
                            String(assignment.id)
                          );
                        }}
                      >
                        <strong>{assignment.staff}</strong>
                        <small>
                          {assignment.start} - {assignment.end}
                        </small>
                      </span>
                    ))}
                    {canEdit && (
                      <span className="cell-add">
                        <Plus size={14} />
                        Staff
                      </span>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </section>

          {canEdit && (
            <aside className="details-panel desktop-details-panel">
              {renderAssignmentEditor()}
            </aside>
          )}
        </div>
      </section>
      {canEdit && isMobileEditorOpen && (
        <div className="mobile-editor-backdrop">
          <section className="mobile-editor-sheet">
            {renderAssignmentEditor()}
          </section>
        </div>
      )}
      {canEdit && isClearConfirmOpen && (
        <div className="drop-dialog-backdrop">
          <section className="drop-dialog" aria-label="Clear schedule confirmation">
            <h2>Clear schedule?</h2>
            <p>
              This will remove every saved slot from the schedule. This action
              cannot be undone.
            </p>
            <div className="drop-dialog-actions">
              <button
                className="danger-button"
                onClick={clearSchedule}
              >
                Yes, clear everything
              </button>
              <button
                className="secondary-button"
                onClick={() => setIsClearConfirmOpen(false)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
      {canEdit && pendingDrop && (
        <div className="drop-dialog-backdrop">
          <section className="drop-dialog" aria-label="Drop assignment choice">
            <h2>Move or duplicate?</h2>
            <p>
              Choose whether to move this staff member to the new shift or keep
              the original and duplicate it here.
            </p>
            {pendingDrop.sourceShift !== pendingDrop.shift && (
              <div className="drop-time-editor">
                <label>
                  Starting hour
                  <input
                    type="time"
                    value={pendingDrop.start}
                    onChange={(event) =>
                      setPendingDrop((current) => ({
                        ...current,
                        start: event.target.value,
                        error: ""
                      }))
                    }
                  />
                </label>
                <EndingOptions
                  name="drop-end"
                  shift={pendingDrop.shift}
                  endMode={getValidEndMode(
                    pendingDrop.shift,
                    pendingDrop.endMode
                  )}
                  endTime={pendingDrop.endTime}
                  onEndModeChange={(value) =>
                    setPendingDrop((current) => ({
                      ...current,
                      endMode: value
                    }))
                  }
                  onEndTimeChange={(value) =>
                    setPendingDrop((current) => ({
                      ...current,
                      endTime: value
                    }))
                  }
                />
              </div>
            )}
            {pendingDrop.error && (
              <p className="form-error">{pendingDrop.error}</p>
            )}
            <div className="drop-dialog-actions">
              <button
                className="secondary-button"
                onClick={() => completeDrop("move")}
              >
                Move
              </button>
              <button
                className="primary-button"
                onClick={() => completeDrop("duplicate")}
              >
                Duplicate
              </button>
              <button
                className="secondary-button"
                onClick={() => setPendingDrop(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const reservationStatuses = [
  ["confirmed", "Confirmed"],
  ["arrived", "Arrived"],
  ["seated", "Seated"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["no-show", "No-show"]
];

const emptyReservation = {
  customerName: "",
  date: new Date().toISOString().slice(0, 10),
  time: "19:30",
  guests: 2,
  phone: "",
  email: "",
  table: "",
  notes: "",
  status: "confirmed"
};

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date) {
  const current = new Date(`${date}T12:00:00`);
  const day = current.getDay() || 7;
  current.setDate(current.getDate() - day + 1);
  return current;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("boss@terrasse.local");
  const [password, setPassword] = useState("boss123");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      onLogin(await api("/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      }));
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <p className="eyebrow">Terrasse Manager</p>
        <h1>Sign in</h1>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button">
          <UserRound size={17} />
          Login
        </button>
        <p className="auth-hint">Admin: boss@terrasse.local / boss123</p>
        <p className="auth-hint">Employee: julien@terrasse.local / julien123</p>
      </form>
    </main>
  );
}

function Reservations({ canEdit = false, session, refresh }) {
  const [mode, setMode] = useState("day");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyReservation);
  const [error, setError] = useState("");
  const weekStart = startOfWeek(selectedDate);
  const dates = mode === "day"
    ? [selectedDate]
    : Array.from({ length: 7 }, (_, index) => toDateInput(addDays(weekStart, index)));
  const filteredReservations = session.reservations.filter((reservation) => {
    const matchesDate = dates.includes(reservation.date);
    const matchesName = reservation.customerName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || reservation.status === status;

    return matchesDate && matchesName && matchesStatus;
  });
  const dayReservations = session.reservations.filter(
    (reservation) => reservation.date === selectedDate
  );
  const expectedGuests = dayReservations.reduce(
    (total, reservation) => total + Number(reservation.guests || 0),
    0
  );

  function startReservation(reservation) {
    setEditingId(reservation.id);
    setDraft(reservation);
    setError("");
  }

  function resetReservation(date = selectedDate) {
    setEditingId(null);
    setDraft({ ...emptyReservation, date });
    setError("");
  }

  async function saveReservation(event) {
    event.preventDefault();
    setError("");

    try {
      if (editingId) {
        await api(`/reservations/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(draft)
        });
      } else {
        await api("/reservations", {
          method: "POST",
          body: JSON.stringify(draft)
        });
      }

      await refresh();
      resetReservation(draft.date);
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function deleteReservation(id) {
    await api(`/reservations/${id}`, { method: "DELETE" });
    await refresh();
    resetReservation();
  }

  return (
    <section className="addon-workspace">
      <div className="controls-row reservations-toolbar">
        <div className="segmented-control">
          <button
            className={mode === "day" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("day")}
          >
            Day
          </button>
          <button
            className={mode === "week" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("week")}
          >
            Week
          </button>
        </div>
        <label>
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <label>
          Customer
          <span className="search-input">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </span>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {reservationStatuses.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="daily-summary">
        <strong>{dayReservations.length}</strong>
        <span>reservations</span>
        <strong>{expectedGuests}</strong>
        <span>expected guests</span>
      </div>

      <div className={canEdit ? "reservations-grid" : "reservations-grid readonly-reservations-grid"}>
        <div className="reservations-calendar">
          {dates.map((date) => (
            <section className="reservation-day" key={date}>
              <header>
                <h2>{date}</h2>
                {canEdit && (
                  <button
                    className="icon-button"
                    aria-label="Add reservation"
                    onClick={() => resetReservation(date)}
                  >
                    <Plus size={17} />
                  </button>
                )}
              </header>
              {filteredReservations
                .filter((reservation) => reservation.date === date)
                .map((reservation) => (
                  <button
                    className={`reservation-card status-${reservation.status}`}
                    key={reservation.id}
                    onClick={() => startReservation(reservation)}
                  >
                    <strong>{reservation.time} · {reservation.customerName}</strong>
                    <span>{reservation.guests} guests · {reservation.phone}</span>
                    <small>
                      {reservationStatuses.find(([value]) => value === reservation.status)?.[1]}
                      {reservation.table ? ` · Table ${reservation.table}` : ""}
                    </small>
                  </button>
                ))}
            </section>
          ))}
        </div>

        {canEdit && (
        <aside className="details-panel reservation-editor">
          <div>
            <p className="eyebrow">
              {editingId ? "Edit reservation" : "New reservation"}
            </p>
            <h2>{draft.customerName || "Reservation details"}</h2>
          </div>
            <form className="assignment-form" onSubmit={saveReservation}>
              <label>
                Customer name
                <input
                  value={draft.customerName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, customerName: event.target.value }))
                  }
                />
              </label>
              <div className="addon-form-grid">
                <label>
                  Date
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, date: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, time: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="addon-form-grid">
                <label>
                  Guests
                  <input
                    min="1"
                    type="number"
                    value={draft.guests}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, guests: Number(event.target.value) }))
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    {reservationStatuses.map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Phone
                <input
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Table
                <input
                  value={draft.table}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, table: event.target.value }))
                  }
                />
              </label>
              <label>
                Notes
                <input
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <div className="drop-dialog-actions">
                <button className="primary-button">
                  <Save size={17} />
                  Save
                </button>
                {editingId && (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => deleteReservation(editingId)}
                  >
                    <Trash2 size={17} />
                    Delete
                  </button>
                )}
              </div>
            </form>
        </aside>
        )}
      </div>
    </section>
  );
}

function Profile({ session }) {
  return (
    <section className="addon-workspace staff-profile">
      <article className="profile-card">
        <UserRound size={22} />
        <div>
          <p className="eyebrow">{session.user.roleLabel}</p>
          <h2>{session.user.name}</h2>
          <span>{session.user.email}</span>
        </div>
      </article>
    </section>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("schedule");
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  useEffect(() => {
    api("/me")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setIsLoadingSession(false));
  }, []);

  async function refresh() {
    setSession(await api("/me"));
  }

  async function logout() {
    try {
      await api("/logout", { method: "POST" });
    } finally {
      setSession(null);
      setView("schedule");
    }
  }

  if (isLoadingSession) {
    return <main className="login-page">Loading...</main>;
  }

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  const isAdmin = session.user.role === "admin";

  return (
    <>
      <header className="addon-nav">
        <div>
          <p className="eyebrow">{session.restaurant?.name || "Terrasse"}</p>
          <strong>{session.user.name}</strong>
        </div>
        <nav>
          <button
            className={view === "schedule" ? "primary-button" : "secondary-button"}
            onClick={() => setView("schedule")}
          >
            <CalendarDays size={17} />
            Schedule
          </button>
          <button
            className={view === "reservations" ? "primary-button" : "secondary-button"}
            onClick={() => setView("reservations")}
          >
            <ClipboardList size={17} />
            Reservations
          </button>
          <button
            className={view === "profile" ? "primary-button" : "secondary-button"}
            onClick={() => setView("profile")}
          >
            <UserRound size={17} />
            Profile
          </button>
          <button className="secondary-button" onClick={logout}>
            <LogOut size={17} />
            Logout
          </button>
        </nav>
      </header>
      {view === "schedule" && <ScheduleApp canEdit={isAdmin} />}
      {view === "reservations" && (
        <Reservations canEdit={isAdmin} session={session} refresh={refresh} />
      )}
      {view === "profile" && <Profile session={session} />}
    </>
  );
}

export default App;
