import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Save,
} from "lucide-react";
import { useState } from "react";

const baseWeekStart = new Date(2026, 5, 15);
const dayInMs = 24 * 60 * 60 * 1000;

const shiftSections = [
  {
    id: "morning",
    name: "Morning shift"
  },
  {
    id: "night",
    name: "Night shift"
  }
];

const team = ["Julien", "Mehssen", "Mostafa", "Mario", "Ali Saade", "Rassil", "Racha", "Laura", "Ali Ahmad", "Jad", "Zelda"];

const initialAssignments = [];
const timePattern = /^\d{2}:\d{2}$/;
const nightShiftStart = "18:00";
const endingOptionsByShift = {
  morning: [
    { value: "fin de service", label: "Fin de service" }
  ],
  night: [
    { value: "fermeture", label: "Fermeture" },
    { value: "fin de service", label: "Fin de service" }
  ]
};

function isAtOrAfter(time, threshold) {
  return time >= threshold;
}

function getShiftRuleError(shift, start) {
  if (shift === "morning" && isAtOrAfter(start, nightShiftStart)) {
    return "Morning shift starts must be before 18:00.";
  }

  return "";
}

function getValidEndMode(shift, endMode) {
  if (shift === "morning" && endMode === "custom") {
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
      {shift === "morning" && (
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
  const [assignments, setAssignments] = useState(initialAssignments);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState({ day: 0, shift: "night" });
  const [pendingDrop, setPendingDrop] = useState(null);
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState({
    staff: team[0],
    start: "18:00",
    end: "fermeture",
    endTime: "23:00"
  });

  const weekStart = new Date(baseWeekStart.getTime() + weekOffset * 7 * dayInMs);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * dayInMs);

    return {
      key: index,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      date: date.getDate(),
      month: date.toLocaleDateString("en-US", { month: "short" })
    };
  });
  const weekEnd = days[6];
  const weekLabel = `${days[0].month} ${days[0].date}-${weekEnd.month === days[0].month ? "" : `${weekEnd.month} `}${weekEnd.date}`;
  const selectedShift = shiftSections.find((shift) => shift.id === selectedSlot.shift);
  const selectedAssignments = assignments.filter(
    (assignment) =>
      assignment.week === weekOffset &&
      assignment.day === selectedSlot.day &&
      assignment.shift === selectedSlot.shift
  );

  function getAssignments(day, shift) {
    return assignments.filter(
      (assignment) =>
        assignment.week === weekOffset &&
        assignment.day === day &&
        assignment.shift === shift
    );
  }

  function handleExport() {
    document.title = `Terrasse schedule ${weekLabel}`;
    window.print();
  }

  function changeWeek(direction) {
    setWeekOffset((current) => current + direction);
    setSelectedSlot((current) => ({ ...current, day: 0 }));
  }

  function handleAddAssignment(event) {
    event.preventDefault();
    const error = getShiftRuleError(selectedSlot.shift, draft.start);

    if (error) {
      setFormError(error);
      return;
    }

    const endMode = getValidEndMode(selectedSlot.shift, draft.end);
    const end = endMode === "custom" ? draft.endTime : endMode;

    setFormError("");
    setAssignments((current) => [
      ...current,
      {
        id: Date.now(),
        week: weekOffset,
        day: selectedSlot.day,
        shift: selectedSlot.shift,
        staff: draft.staff,
        start: draft.start,
        end
      }
    ]);
  }

  function handleRemoveAssignment(id) {
    setAssignments((current) =>
      current.filter((assignment) => assignment.id !== id)
    );
  }

  function handleDrop(event, day, shift) {
    event.preventDefault();
    const assignmentId = Number(event.dataTransfer.getData("text/plain"));
    const assignment = assignments.find((item) => item.id === assignmentId);

    if (!assignment) {
      return;
    }

    setSelectedSlot({ day, shift });
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
            <button className="secondary-button" onClick={handleExport}>
              <Download size={17} />
              Export PDF
            </button>
            <button className="primary-button">
              <Save size={17} />
              Publish
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="schedule-board" aria-label="Weekly schedule">
            <div className="board-header">
              <span>Shift</span>
              {days.map((day) => (
                <span key={day.key}>
                  <strong>{day.label}</strong>
                  <small>
                    {day.month} {day.date}
                  </small>
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
                    onClick={() => setSelectedSlot({ day: day.key, shift: shift.id })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, day.key, shift.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        setSelectedSlot({ day: day.key, shift: shift.id });
                      }
                    }}
                  >
                    {getAssignments(day.key, shift.id).map((assignment) => (
                      <span
                        className={`event-pill ${getStaffColorClass(assignment.staff)}`}
                        draggable
                        key={assignment.id}
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

            <form className="assignment-form" onSubmit={handleAddAssignment}>
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
              <button className="primary-button" type="submit">
                <Plus size={17} />
                Add staff
              </button>
              {formError && <p className="form-error">{formError}</p>}
            </form>

            <ul className="assignment-list">
              {selectedAssignments.map((assignment) => (
                <li key={assignment.id}>
                  <strong>
                    {assignment.staff}
                    <small>
                      {assignment.start} - {assignment.end}
                    </small>
                  </strong>
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
