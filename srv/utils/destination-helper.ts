// srv/utils/destination-helper.ts
import cds from '@sap/cds';

export interface DestinationConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}

/**
 * ✅ Liest SFTP Credentials aus BTP Destination oder lokaler Config
 */
export async function getSftpDestination(destinationName: string = 'SFTP_SHIPDATA'): Promise<DestinationConfig> {
  const LOG = cds.log('destination-helper');
  
  // Development: Use environment variables
  if (process.env.NODE_ENV !== 'production' && !process.env.VCAP_SERVICES) {
    LOG.info('📍 Using local .env configuration');
    
    return {
      host: process.env.SSH_HOST || '',
      port: parseInt(process.env.SSH_PORT || '22'),
      username: process.env.SSH_USER || '',
      password: process.env.SSH_PASSWORD || '',
      remotePath: process.env.SSH_REMOTE_PATH || '/'
    };
  }
  
  // Production: Use BTP Destination Service
  try {
    LOG.info(`📍 Reading destination: ${destinationName}`);
    
    const { destination } = await import('@sap-cloud-sdk/connectivity');
    
    const dest = await destination.getDestination({
      destinationName,
      jwt: cds.context?.http?.req?.authInfo?.getTokenValue?.() || undefined
    });
    
    if (!dest) {
      throw new Error(`Destination '${destinationName}' not found`);
    }
    
    // Extract configuration
    const config: DestinationConfig = {
      host: dest.destinationConfiguration['sap.sftp.host'] || extractHostFromUrl(dest.url),
      port: parseInt(dest.destinationConfiguration['sap.sftp.port'] || '22'),
      username: dest.username || '',
      password: dest.password || '',
      remotePath: dest.destinationConfiguration['sap.sftp.remotePath'] || '/'
    };
    
    LOG.info(`✅ Destination loaded: ${config.host}:${config.port}`);
    
    return config;
    
  } catch (error: any) {
    LOG.error(`❌ Failed to load destination:`, error);
    throw new Error(`Could not load SFTP destination '${destinationName}': ${error.message}`);
  }
}

function extractHostFromUrl(url?: string): string {
  if (!url) return '';
  
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // Fallback: sftp://host:port format
    const match = url.match(/sftp:\/\/([^:\/]+)/);
    return match ? match[1] : url;
  }
}
