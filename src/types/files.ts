export interface FileAttachment {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  mimeType: string;
  url: string;
  entityType: 'property' | 'client' | 'document' | 'task';
  entityId: string;
  uploadedBy: string;
  createdAt: Date;
  deletedAt?: Date;
}