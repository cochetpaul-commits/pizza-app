"use client";

import { useRef } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  steps: string[];
  onChange: (steps: string[]) => void;
  /** Map of step index → photo URL */
  stepPhotos?: Record<number, string>;
  onPhotoChange?: (idx: number, url: string | null) => void;
  recipeId?: string | null;
}

export function StepsList({ steps, onChange, stepPhotos, onPhotoChange, recipeId }: Props) {
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
                      >&#x2807;</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#999", paddingTop: 6, flexShrink: 0, minWidth: 18 }}>
                        {i + 1}.
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <textarea
                          value={step}
                          onChange={e => update(i, e.target.value)}
                          rows={2}
                          placeholder={`Etape ${i + 1}...`}
                          style={{
                            width: "100%", resize: "vertical", borderRadius: 8,
                            border: "1px solid rgba(217,199,182,0.8)", padding: "6px 10px",
                            fontSize: 14, background: "rgba(255,255,255,0.8)",
                            fontFamily: "inherit", lineHeight: 1.5,
                          }}
                        />
                        {/* Photo */}
                        {stepPhotos?.[i] && (
                          <div style={{ marginTop: 6, position: "relative", display: "inline-block" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={stepPhotos[i]} alt={`Etape ${i + 1}`} style={{ maxHeight: 120, borderRadius: 8, border: "1px solid #e0d8ce" }} />
                            <button type="button" onClick={() => onPhotoChange?.(i, null)} style={{
                              position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                              background: "#DC2626", color: "#fff", border: "none", fontSize: 10, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>x</button>
                          </div>
                        )}
                        {onPhotoChange && !stepPhotos?.[i] && (
                          <StepPhotoUpload recipeId={recipeId} stepIndex={i} onUploaded={(url) => onPhotoChange(i, url)} />
                        )}
                      </div>
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
                      >x</button>
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
      >+ Ajouter une etape</button>
    </div>
  );
}

function StepPhotoUpload({ recipeId, stepIndex, onUploaded }: { recipeId?: string | null; stepIndex: number; onUploaded: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const id = recipeId ?? "draft";
    const path = `steps/${id}/step-${stepIndex}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("recipe-images").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { alert("Erreur upload: " + error.message); return; }
    const { data } = supabase.storage.from("recipe-images").getPublicUrl(path);
    if (data?.publicUrl) onUploaded(data.publicUrl);
  }

  return (
    <label style={{
      display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
      padding: "3px 8px", borderRadius: 6, border: "1px dashed #ccc",
      fontSize: 10, color: "#999", cursor: "pointer",
    }}>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
      Photo
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </label>
  );
}
