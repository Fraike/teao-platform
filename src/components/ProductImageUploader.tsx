import { useState } from "react";
import { Button, Tooltip, message } from "antd";
import { CameraOutlined, DeleteOutlined } from "@ant-design/icons";
import { isSupportedImageFile, scaleImage } from "../lib/imageUtils";
import styles from "./ProductImageUploader.module.css";

interface ProductImageUploaderProps {
  image?: string;
  onChange: (image?: string) => void;
  uploadLabel: string;
}

export function ProductImageUploader({ image, onChange, uploadLabel }: ProductImageUploaderProps) {
  const [dragging, setDragging] = useState(false);

  const upload = (file?: File) => {
    if (!file) return;
    if (!isSupportedImageFile(file)) {
      message.error("请上传图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void scaleImage(String(reader.result), 200).then(onChange);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer.files[0]);
  };

  return (
    <label
      className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {image ? (
        <>
          <Tooltip title={<img src={image} className={styles.preview} alt="" />}>
            <img src={image} className={styles.preview} alt="" />
          </Tooltip>
          <Button
            className={styles.removeButton}
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(event) => { event.preventDefault(); onChange(undefined); }}
          />
        </>
      ) : (
        <span className={styles.hint}><CameraOutlined /><br />{uploadLabel}</span>
      )}
      <input
        className={styles.input}
        type="file"
        accept="image/*"
        onChange={(event) => {
          upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
}
