import React, { useState } from "react";
import { monthNow } from "../api";
import { useAppData } from "../state/AppData";
import { BottomSheet, PrimaryButton } from "./ui";

export function CreateBatchSheet(props: { onClose: () => void; onCreated?: () => void }) {
  const { createBatch } = useAppData();
  const [month, setMonth] = useState(monthNow());
  const [title, setTitle] = useState(`Food orders ${monthNow()}`);
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
      setError(err.message || "Failed to create batch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title="New batch"
      subtitle="A batch groups screenshots for one import — usually one per month."
      onClose={props.onClose}
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={props.onClose}>Cancel</PrimaryButton>
          <PrimaryButton onClick={handleCreate} disabled={saving}>Create batch</PrimaryButton>
        </>
      }
    >
      <div className="stack">
        {error && <div className="banner banner-danger">{error}</div>}
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>
    </BottomSheet>
  );
}
