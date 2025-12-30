import cds from '@sap/cds/eslint.config.mjs'
import cdsPlugin from '@sap/eslint-plugin-cds'
export default [cdsPlugin.configs.recommended, ...cds.recommended ]
