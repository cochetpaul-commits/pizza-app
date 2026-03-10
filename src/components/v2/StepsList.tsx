"use client";

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

interface Props {
  steps: string[];
  onChange: (steps: string[]) => void;
}

export function StepsList({ steps, onChange }: Props) {
  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(steps);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    onChange(reordered);
  }

  function update(idx: number, val: string) {
    const next = steps.map((s, i) => (i === idx ? val : s));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(steps.filter((_, i) => i !== idx));
  }

  function add() {
    onChange([...steps, ""]);
  }

  return (
    <div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="steps">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((step, i) => (
                <Draggable key={String(i)} draggableId={String(i)} index={i}>
                  {(drag, snapshot) => (
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        background: snapshot.isDragging ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                        borderRadius: 10, padding: "8px 10px",
                        border: "1px solid rgba(217,199,182,0.7)",
                        ...drag.draggableProps.style,
                      }}
                    >
                      <span
                        {...drag.dragHandleProps}
                        style={{ fontSize: 16, color: "#999", cursor: "grab", paddingTop: 4, userSelect: "none", flexShrink: 0 }}
                      >⠿</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#999", paddingTop: 6, flexShrink: 0, minWidth: 18 }}>
                        {i + 1}.
                      </span>
                      <textarea
                        value={step}
                        onChange={e => update(i, e.target.value)}
                        rows={2}
                        placeholder={`Étape ${i + 1}…`}
                        style={{
                          flex: 1, resize: "vertical", borderRadius: 8,
                          border: "1px solid rgba(217,199,182,0.8)", padding: "6px 10px",
                          fontSize: 14, background: "rgba(255,255,255,0.8)",
                          fontFamily: "inherit", lineHeight: 1.5,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        style={{
                          flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                          border: "1px solid rgba(217,199,182,0.8)",
                          background: "rgba(255,255,255,0.5)", color: "#9a8f84",
                          fontSize: 13, cursor: "pointer", display: "flex",
                          alignItems: "center", justifyContent: "center",
                        }}
                      >✕</button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <button
        type="button"
        onClick={add}
        style={{
          marginTop: 10, padding: "6px 14px", borderRadius: 8,
          border: "1.5px dashed rgba(217,199,182,0.9)", background: "transparent",
          color: "#6f6a61", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >+ Ajouter une étape</button>
    </div>
  );
}
