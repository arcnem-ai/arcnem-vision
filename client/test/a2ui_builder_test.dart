import 'package:a2ui_core/a2ui_core.dart';
import 'package:arcnem_vision_client/models/document.dart';
import 'package:arcnem_vision_client/services/a2ui_builder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('builds GenUI 0.10 create and flattened component messages', () {
    final messages = buildDocumentListSurface('surface-1', const [
      Document(
        id: 'document-1',
        objectKey: 'uploads/example.png',
        contentType: 'image/png',
        sizeBytes: 42,
        createdAt: '2026-07-16T00:00:00Z',
        description: 'Example document',
        thumbnailUrl: 'https://example.com/thumbnail.png',
      ),
    ], 'Documents');

    expect(messages, hasLength(2));
    expect(
      messages.first,
      isA<CreateSurfaceMessage>()
          .having((message) => message.surfaceId, 'surfaceId', 'surface-1')
          .having(
            (message) => message.catalogId,
            'catalogId',
            'com.arcnem.vision',
          ),
    );

    final update = messages.last as UpdateComponentsMessage;
    expect(update.surfaceId, 'surface-1');
    expect(update.components, hasLength(2));
    expect(update.components.first, {
      'id': 'doc-0',
      'component': 'DocumentCard',
      'title': 'example.png',
      'thumbnailUrl': 'https://example.com/thumbnail.png',
      'description': 'Example document',
      'contentType': 'image/png',
      'createdAt': '2026-07-16T00:00:00Z',
      'documentId': 'document-1',
    });
    expect(update.components.last, {
      'id': 'root',
      'component': 'DocumentGallery',
      'title': 'Documents',
      'children': ['doc-0'],
    });
  });
}
