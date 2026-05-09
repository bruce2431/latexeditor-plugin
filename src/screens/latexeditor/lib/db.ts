import { openDB } from 'idb';
import { LatexProject } from '../types/latex';

const DB_NAME = 'hermes-latex-db';
const STORE_NAME = 'projects';
const IMAGES_STORE_NAME = 'images';

export const initDB = async () => {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      // 版本 1 -> 2 的迁移
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      }
      
      // 版本 2: 添加 images store
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(IMAGES_STORE_NAME)) {
          db.createObjectStore(IMAGES_STORE_NAME, { keyPath: 'name' });
        }
      }
    },
  });
};

export const getProjects = async (): Promise<LatexProject[]> => {
  const db = await initDB();
  // Return descending by updatedAt
  const all = await db.getAll(STORE_NAME);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getProject = async (id: string): Promise<LatexProject | undefined> => {
  const db = await initDB();
  return db.get(STORE_NAME, id);
};

export const saveProject = async (project: LatexProject): Promise<void> => {
  const db = await initDB();
  await db.put(STORE_NAME, project);
};

export const deleteProject = async (id: string): Promise<void> => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

// 图片相关操作
export interface ImageData {
  name: string;
  data: Blob;
  type: string;
  createdAt: number;
}

export const saveImage = async (name: string, data: Blob, type: string): Promise<void> => {
  const db = await initDB();
  const imageData: ImageData = {
    name,
    data,
    type,
    createdAt: Date.now()
  };
  await db.put(IMAGES_STORE_NAME, imageData);
};

export const getImage = async (name: string): Promise<ImageData | undefined> => {
  const db = await initDB();
  return db.get(IMAGES_STORE_NAME, name);
};

export const deleteImage = async (name: string): Promise<void> => {
  const db = await initDB();
  await db.delete(IMAGES_STORE_NAME, name);
};

export const getAllImages = async (): Promise<ImageData[]> => {
  const db = await initDB();
  return db.getAll(IMAGES_STORE_NAME);
};
