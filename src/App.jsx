import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Save,
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

const team = ["Julien", "Mehssen", "Mostafa", "Mario", "Ali Saade", "Rassil", "Racha", "Laura", "Ali Ahmad", "Jad", "Zelda"];
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
  { text: "#7b3155", background: "#ffe4f0", border: "#ef9bc2" }
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

function getStaffColorClass(staff) {
  const index = team.indexOf(staff);
  return `staff-color-${index >= 0 ? index : 0}`;
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
  const index = team.indexOf(staff);

  return staffPalette[index >= 0 ? index : 0];
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

function App() {
  const [assignments, setAssignments] = useState(loadStoredAssignments);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState({ day: 0, shift: "soir" });
  const [repeatDays, setRepeatDays] = useState([0]);
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [formError, setFormError] = useState("");
  const [hasLoadedDiskStorage, setHasLoadedDiskStorage] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Loading saved schedule...");
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
      assignment.shift === selectedSlot.shift
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
    if (!hasLoadedDiskStorage) {
      return;
    }

    window.localStorage.setItem(
      assignmentsStorageKey,
      JSON.stringify(assignments)
    );

    savePersistedAssignments(assignments)
      .then(() => setStorageStatus("Saved to data/schedule.json"))
      .catch(() => setStorageStatus("Using browser backup only"));
  }, [assignments, hasLoadedDiskStorage]);

  function getAssignments(day, shift) {
    return assignments.filter(
      (assignment) =>
        assignment.week === weekOffset &&
        assignment.day === day &&
        assignment.shift === shift
    );
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
    document.title = "Terrasse weekly schedule";
    window.print();
  }

  async function handleExportJpg() {
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

    if (shouldOpenEditor) {
      setIsMobileEditorOpen(true);
    }
  }

  function startEditAssignment(assignment, shouldOpenEditor = false) {
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
    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== id)
    );
    if (editingAssignmentId === id) {
      cancelEdit();
    }
  }

  function handleDrop(event, day, shift) {
    event.preventDefault();
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
                onClick={() => startEditAssignment(assignment)}
              >
                {assignment.staff}
                <small>
                  {assignment.start} - {assignment.end}
                </small>
              </button>
              <button onClick={() => handleRemoveAssignment(assignment.id)}>
                Remove
              </button>
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
            <div className="export-actions">
              <button className="secondary-button" onClick={handleExportPdf}>
                <Download size={17} />
                PDF
              </button>
              <button className="primary-button" onClick={handleExportJpg}>
                <Download size={17} />
                JPG / Share
              </button>
            </div>
          </div>
        </header>

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
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, day.key, shift.id)}
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
                        draggable
                        key={assignment.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditAssignment(assignment);
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
                    <span className="cell-add">
                      <Plus size={14} />
                      Staff
                    </span>
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
                    onClick={() => selectSlot(day.key, shift.id, true)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, day.key, shift.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        selectSlot(day.key, shift.id, true);
                      }
                    }}
                  >
                    <span className="mobile-shift-title">{shift.name}</span>
                    {getAssignments(day.key, shift.id).map((assignment) => (
                      <span
                        className={`event-pill ${getStaffColorClass(assignment.staff)} ${
                          editingAssignmentId === assignment.id ? "editing-event" : ""
                        }`}
                        draggable
                        key={assignment.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditAssignment(assignment, true);
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
                    <span className="cell-add">
                      <Plus size={14} />
                      Staff
                    </span>
                  </div>
                ))}
              </article>
            ))}
          </section>

          <aside className="details-panel desktop-details-panel">
            {renderAssignmentEditor()}
          </aside>
        </div>
      </section>
      {isMobileEditorOpen && (
        <div className="mobile-editor-backdrop">
          <section className="mobile-editor-sheet">
            {renderAssignmentEditor()}
          </section>
        </div>
      )}
      {pendingDrop && (
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

export default App;
