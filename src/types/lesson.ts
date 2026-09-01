export type LessonType = 'automática' | 'teórica' | 'prática' | 'teórico-prática';
export type ResolvedLessonType = Exclude<LessonType, 'automática'>;
export interface LessonTypeDecision { requestedType: LessonType; resolvedType: ResolvedLessonType; reason: string; descriptionOverridesSelection: boolean; }
export interface LessonTypeValidation { requestedType: ResolvedLessonType; detectedGeneratedType: ResolvedLessonType; aligned: boolean; reason: string; }
