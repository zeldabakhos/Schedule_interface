import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Save,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

function getDocumentStyles() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  const scheduleBoardRef = useRef(null);
  const [assignments, setAssignments] = useState(loadStoredAssignments);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState({ day: 0, shift: "soir" });
  const [repeatDays, setRepeatDays] = useState([0]);
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
    const board = scheduleBoardRef.current;

    if (!board) {
      return;
    }

    const scale = 2;
    const width = Math.ceil(board.scrollWidth);
    const height = Math.ceil(board.scrollHeight);
    const clonedBoard = board.cloneNode(true);

    clonedBoard.style.width = `${width}px`;
    clonedBoard.style.background = "#ffffff";

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <style>${getDocumentStyles()}</style>
            ${clonedBoard.outerHTML}
          </div>
        </foreignObject>
      </svg>
    `;
    const svgBlob = new Blob([svg], {
      type: "image/svg+xml;charset=utf-8"
    });
    const imageUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.src = imageUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = width * scale;
    canvas.height = height * scale;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(imageUrl);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, "terrasse-weekly-schedule.jpg");
        }
      },
      "image/jpeg",
      0.95
    );
  }

  function changeWeek(direction) {
    setWeekOffset((current) => current + direction);
    setSelectedSlot((current) => ({ ...current, day: 0 }));
    setRepeatDays([0]);
    cancelEdit();
  }

  function selectSlot(day, shift) {
    setSelectedSlot({ day, shift });

    if (!isEditing) {
      setRepeatDays([day]);
    }
  }

  function startEditAssignment(assignment) {
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
                JPG
              </button>
            </div>
          </div>
        </header>

        <div className="content-grid">
          <section
            className="schedule-board"
            aria-label="Weekly schedule"
            ref={scheduleBoardRef}
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

          <aside className="details-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Selected slot</p>
                <h2>{selectedShift.name}</h2>
              </div>
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
          </aside>
        </div>
      </section>
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
