/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as storiesDigest } from './stories-digest.tsx'
import { template as mobileAdPublished } from './mobile-ad-published.tsx'
import { template as dailyBusinessReport } from './daily-business-report.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'stories-digest': storiesDigest,
  'mobile-ad-published': mobileAdPublished,
  'daily-business-report': dailyBusinessReport,
}
