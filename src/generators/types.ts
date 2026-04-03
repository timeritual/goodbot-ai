export interface GeneratorContext {
  project: {
    name: string;
    framework: string;
    language: string;
    description?: string;
  };
  architecture: {
    layers: Array<{
      name: string;
      path: string;
      level: number;
      hasBarrel: boolean;
      description?: string;
    }>;
    dependencyDirection: string;
    barrelImportRule: string;
    interfaceContracts: boolean;
    layerDiagramAscii: string;
  };
  businessLogic: {
    allowedIn: string[];
    forbiddenIn: string[];
    redFlags: string[];
  };
  verification: {
    commands: Array<{ name: string; command: string }>;
  };
  conventions: {
    mainBranch: string;
    importStyle: string;
    customRules: string[];
  };
  ignore: {
    paths: string[];
    sensitiveFiles: string[];
  };
  // Computed flags
  isReact: boolean;
  isReactNative: boolean;
  isNext: boolean;
  isNode: boolean;
  isPython: boolean;
  isTypescript: boolean;
  hasBarrels: boolean;
  hasLayers: boolean;
  hasRedFlags: boolean;
  hasCustomRules: boolean;
  hasVerification: boolean;
}

export interface GeneratedFile {
  fileName: string;
  relativePath: string;
  content: string;
}
