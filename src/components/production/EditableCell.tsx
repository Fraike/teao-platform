import { useState, type ReactNode } from "react";
import { Input, InputNumber } from "antd";

export type FieldType = "text" | "number";

interface EditableCellProps {
  value: string | number;
  fieldType: FieldType;
  onSave: (newValue: string | number) => void;
  min?: number;
  format?: (v: string | number) => ReactNode;
}

export function EditableCell({
  value,
  fieldType,
  onSave,
  min = 0,
  format,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    setEditing(false);
    if (editValue !== value) {
      onSave(editValue);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue(value);
  };

  if (editing) {
    if (fieldType === "number") {
      return (
        <InputNumber
          autoFocus
          size="small"
          value={editValue as number}
          onChange={(v) => setEditValue(v ?? 0)}
          onPressEnter={handleSave}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
          min={min}
          style={{ width: "100%" }}
        />
      );
    }
    return (
      <Input
        autoFocus
        size="small"
        value={editValue as string}
        onChange={(e) => setEditValue(e.target.value)}
        onPressEnter={handleSave}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
        style={{ width: "100%", padding: "2px 4px" }}
      />
    );
  }

  const displayValue = format ? format(value) : String(value || "");

  return (
    <div
      onDoubleClick={() => {
        setEditValue(value);
        setEditing(true);
      }}
      style={{
        minHeight: 22,
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 2,
        fontSize: 13,
      }}
      title="双击编辑"
      className="editable-cell"
    >
      {displayValue || <span style={{ color: "#ccc" }}>-</span>}
    </div>
  );
}
