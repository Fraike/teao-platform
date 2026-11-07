export type PushChannel = 'standardPublication' | 'standardReview' | 'production';
export interface PushSettings {
  enabled: boolean;
  standardPublicationEnabled: boolean;
  standardReviewEnabled: boolean;
  reviewTimes: string[];
  productionEnabled: boolean;
  productionTime: string | null;
  revision: number;
  productionRevision: string;
  updatedAt: string;
  updatedBy: string;
  nextReviewAt: string | null;
  nextProductionAt: string | null;
  productionScheduleLegacy: boolean;
}
export type PushSettingsInput = Pick<PushSettings, 'enabled' | 'standardPublicationEnabled' | 'standardReviewEnabled' | 'reviewTimes' | 'productionEnabled' | 'productionTime' | 'revision' | 'productionRevision'>;
export interface PushSettingsActor { id: string; name?: string; username?: string }
