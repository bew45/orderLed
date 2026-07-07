import React, { useState } from "react";
import { monthNow } from "../api";
import { useAppData } from "../state/AppData";
import { Alert, BottomSheet, PrimaryButton } from "./ui";

export function CreateBatchSheet(props: { onClose: () => void; onCreated?: () => void }) {
  const { createBatch } = useAppData();
  const [month] = useState(monthNow());
  const [title, setTitle] = useState(`Food order import ${monthNow()}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      await createBatch({ title, month });
      props.onCreated?.();
      props.onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create import");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title="New import"
      subtitle="An import can contain screenshots from one or many months."
      onClose={props.onClose}
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={props.onClose}>Cancel</PrimaryButton>
          <PrimaryButton onClick={handleCreate} disabled={saving}>Create import</PrimaryButton>
        </>
      }
    >
      <div className="stack">
        {error && <Alert variant="error" message={error} />}
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
      </div>
    </BottomSheet>
  );
}
