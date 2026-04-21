export type Framework =
  | 'react'
  | 'react-native'
  | 'next'
  | 'angular'
  | 'vue'
  | 'nuxt'
  | 'node'
  | 'express'
  | 'nest'
  | 'python'
  | 'django'
  | 'flask'
  | 'fastapi'
  | 'go'
  | 'other';

export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'other';

export interface FrameworkDetection {
  framework: Framework;
  confidence: 'high' | 'medium' | 'low';
  detectedFrom: string;
}

export interface LanguageDetection {
  primary: Language;
  secondary: Language[];
}

export interface DetectedLayerRole {
  id: string;
  displayName: string;
  description: string;
  isLeaf?: boolean;
}

export interface DetectedLayer {
  name: string;
  path: string;
  suggestedLevel: number;
  hasBarrel: boolean;
  hasInterfaces: boolean;
  role?: DetectedLayerRole;
}

export interface StructureAnalysis {
  srcRoot: string | null;
  detectedLayers: DetectedLayer[];
  hasBarrelFiles: boolean;
  hasInterfaceFiles: boolean;
  testStrategy: 'colocated' | 'separate' | 'both' | 'none';
}

export interface VerificationCommands {
  typecheck: string | null;
  lint: string | null;
  test: string | null;
  format: string | null;
  build: string | null;
}

export interface FrameworkConvention {
  name: string;
  description: string;
  evidence: string;
}

export interface FrameworkPatterns {
  conventions: FrameworkConvention[];
  structuralNotes: string[];
}

export interface ScanResult {
  projectRoot: string;
  projectName: string;
  framework: FrameworkDetection;
  language: LanguageDetection;
  structure: StructureAnalysis;
  verification: VerificationCommands;
  frameworkPatterns: FrameworkPatterns;
  defaultBranch: string;
  systemType: 'api' | 'ui' | 'mixed' | 'library';
}
