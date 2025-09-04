/**
 * Auto-generate Durable Object bindings and migrations from container config
 */

import { autoGenerateContainerDurableObjects } from '../config';
import type { Config } from '../../config';

describe('autoGenerateContainerDurableObjects', () => {
  test('should auto-generate DO bindings and migrations for simple container', () => {
    const config: Partial<Config> = {
      containers: [
        {
          name: 'data-processor',
          class_name: 'DataProcessorContainer',
          image: 'docker-registry.cfdata.org/stash/processor@sha256:abc123'
        }
      ]
    };

    autoGenerateContainerDurableObjects(config as Config);

    expect(config.durable_objects).toBeDefined();
    expect(config.durable_objects!.bindings).toHaveLength(1);
    expect(config.durable_objects!.bindings[0]).toEqual({
      name: 'DATA_PROCESSOR',
      class_name: 'DataProcessorContainer'
    });
  });

  test('should auto-generate DO bindings and migrations for multiple containers', () => {
    const config: Partial<Config> = {
      containers: [
        {
          name: 'frontend-server',
          class_name: 'FrontendServerContainer',
          image: 'docker-registry.cfdata.org/stash/frontend@sha256:def456'
        },
        {
          name: 'api-backend',
          class_name: 'ApiBackendContainer',
          image: 'docker-registry.cfdata.org/stash/backend@sha256:ghi789'
        }
      ]
    };

    autoGenerateContainerDurableObjects(config as Config);

    expect(config.durable_objects!.bindings).toHaveLength(2);
    expect(config.durable_objects!.bindings[0].name).toBe('FRONTEND_SERVER');
    expect(config.durable_objects!.bindings[1].name).toBe('API_BACKEND');
    expect(config.migrations).toBeDefined();
    expect(config.migrations).toHaveLength(1);
    expect(config.migrations![0].tag).toBe('v1');
    expect(config.migrations![0].new_sqlite_classes).toContain('FrontendServerContainer');
    expect(config.migrations![0].new_sqlite_classes).toContain('ApiBackendContainer');
  });

  test('should preserve existing DO bindings', () => {
    const config: Partial<Config> = {
      containers: [
        {
          name: 'new-processor',
          class_name: 'NewProcessorContainer',
          image: 'docker-registry.cfdata.org/stash/new@sha256:jkl012'
        }
      ],
      durable_objects: {
        bindings: [
          {
            name: 'EXISTING_DO',
            class_name: 'ExistingDO'
          }
        ]
      }
    };

    autoGenerateContainerDurableObjects(config as Config);

    expect(config.durable_objects!.bindings).toHaveLength(2);
    expect(config.durable_objects!.bindings[0].name).toBe('EXISTING_DO');
    expect(config.durable_objects!.bindings[1].name).toBe('NEW_PROCESSOR');
  });

  test('should handle kebab-case container names correctly', () => {
    const config: Partial<Config> = {
      containers: [
        {
          name: 'data-processing-pipeline',
          class_name: 'DataProcessingPipelineContainer',
          image: 'docker-registry.cfdata.org/stash/pipeline@sha256:pqr678'
        }
      ]
    };

    autoGenerateContainerDurableObjects(config as Config);

    expect(config.durable_objects!.bindings[0].name).toBe('DATA_PROCESSING_PIPELINE');
  });

  test('should not modify config when no containers exist', () => {
    const config: Partial<Config> = {};

    autoGenerateContainerDurableObjects(config as Config);

    expect(config.durable_objects).toBeUndefined();
    expect(config.migrations).toBeUndefined();
  });
});
