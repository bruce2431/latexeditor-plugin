import { useCallback, useEffect, useState } from 'react';
import { CompileAsset, LatexFile, LatexProject } from '../types/latex';
import * as db from '../lib/db';
import { getFileType } from '../types/latex';

export function useLatexProject(projectId?: string) {
  const [project, setProject] = useState<LatexProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateFile = useCallback(
    (fileId: string, content: string) => {
      if (!project) return;
      const updatedFiles = project.files.map((f) =>
        f.id === fileId ? { ...f, content, updatedAt: Date.now() } : f,
      );
      const updatedProject = {
        ...project,
        files: updatedFiles,
        updatedAt: Date.now(),
      };
      setProject(updatedProject);
      db.saveProject(updatedProject).catch((e) => console.error('Failed to save', e));
    },
    [project],
  );

  useEffect(() => {
    const loadProject = async () => {
      setIsLoading(true);
      if (projectId) {
        const nextProject = await db.getProject(projectId);
        setProject(nextProject ?? null);
      } else {
        const allProjects = await db.getProjects();
        setProject(allProjects[0] ?? null);
      }
      setIsLoading(false);
    };

    void loadProject();
  }, [projectId]);

  const saveAndSetProject = useCallback(async (newProject: LatexProject) => {
    setProject(newProject);
    await db.saveProject(newProject);
  }, []);

  const deleteProject = useCallback(async () => {
    if (!project) return;
    await db.deleteProject(project.id);
  }, [project]);

  const importFiles = useCallback(
    async (files: { name: string; content: string }[]) => {
      if (!project) return [] as LatexFile[];

      const now = Date.now();
      const importedFiles: LatexFile[] = files.map((file, index) => ({
        id: `file-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        content: file.content,
        createdAt: now,
        updatedAt: now,
        type: getFileType(file.name),
      }));

      const updatedProject = {
        ...project,
        files: [...project.files, ...importedFiles],
        updatedAt: Date.now(),
      };
      await saveAndSetProject(updatedProject);
      return importedFiles;
    },
    [project, saveAndSetProject],
  );

  const importImages = useCallback(
    async (images: { name: string; data: Blob; type: string }[]) => {
      if (!project) return [] as string[];

      for (const image of images) {
        await db.saveImage(image.name, image.data, image.type);
      }

      const now = Date.now();
      const imageFiles: LatexFile[] = images.map((image, index) => ({
        id: `image-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        name: image.name,
        content: `[Image: ${image.name}]`,
        createdAt: now,
        updatedAt: now,
        type: 'image',
      }));

      const updatedProject = {
        ...project,
        files: [...project.files, ...imageFiles],
        updatedAt: Date.now(),
      };
      setProject(updatedProject);
      await db.saveProject(updatedProject);
      return imageFiles.map((file) => file.name);
    },
    [project],
  );

  const getImageDataUrl = useCallback(async (name: string): Promise<string> => {
    const imageData = await db.getImage(name);
    if (!imageData) {
      throw new Error(`Image not found: ${name}`);
    }
    return URL.createObjectURL(imageData.data);
  }, []);

  const getCompileAssets = useCallback(
    async (fileNames: string[]): Promise<CompileAsset[]> => {
      const assets = await Promise.all(
        fileNames.map(async (fileName) => {
          const imageData = await db.getImage(fileName);
          if (!imageData) return null;

          const arrayBuffer = await imageData.data.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }

          return {
            name: fileName,
            mimeType: imageData.type,
            base64: btoa(binary),
          };
        }),
      );

      return assets.filter((asset): asset is CompileAsset => asset !== null);
    },
    [],
  );

  const deleteImage = useCallback(
    async (name: string) => {
      await db.deleteImage(name);
      if (!project) return;

      const updatedFiles = project.files.filter((f) => f.name !== name);
      const updatedProject = { ...project, files: updatedFiles, updatedAt: Date.now() };
      setProject(updatedProject);
      await db.saveProject(updatedProject);
    },
    [project],
  );

  return {
    project,
    isLoading,
    updateFile,
    setProject,
    saveProject: saveAndSetProject,
    deleteProject,
    importFiles,
    importImages,
    getImageDataUrl,
    getCompileAssets,
    deleteImage,
  };
}
