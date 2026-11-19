import type { components } from './openapi';

type Schemas = components['schemas'];
export type User = Schemas['UserResponse'];
export type RegisterResponse = Schemas['UserResponse'];
export type LoginResponse = Schemas['Token'];
export type ProgressStats = Schemas['ProgressStats'];
export type VideoInfo = Schemas['LessonResponse'];
export type LearningSections = Schemas['LearningSectionsResponse'];
export type LearningSection = keyof LearningSections;
export type UserUpdateRequest = Schemas['UserUpdate'];
export type UserProgress = Schemas['UserProgress'];
export type RecognitionStatus = Schemas['ProviderStatus'];
export type CatalogGesture = Schemas['CatalogGestureResponse'];
export type CatalogRevision = Schemas['CatalogRevisionResponse'];
export type CatalogCreate = Schemas['CatalogCreate'];
export type CatalogEdit = Schemas['CatalogEdit'];
export type CatalogTransition = Schemas['CatalogTransition'];
export type CatalogAction = CatalogTransition['action'];
export type CatalogConflict = Schemas['CatalogConflictResponse'];

// Legacy message/error envelopes still have no response_model in the API.
export interface ApiError { detail: string | ValidationIssue[]; }
export interface ValidationIssue { loc?: Array<string | number>; msg: string; type?: string; }
export interface MessageResponse { message: string; }
