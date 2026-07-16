import 'package:a2ui_core/a2ui_core.dart' as core;
import 'package:arcnem_vision_client/models/document.dart';

const _catalogId = 'com.arcnem.vision';

List<core.A2uiMessage> buildDocumentListSurface(
  String surfaceId,
  List<Document> documents,
  String title,
) {
  final components = <Map<String, dynamic>>[];
  final childIds = <String>[];

  for (var i = 0; i < documents.length; i++) {
    final doc = documents[i];
    final componentId = 'doc-$i';
    childIds.add(componentId);

    components.add({
      'id': componentId,
      'component': 'DocumentCard',
      'title': _extractFilename(doc.objectKey),
      'thumbnailUrl': doc.thumbnailUrl,
      'description': doc.description,
      'contentType': doc.contentType,
      'createdAt': doc.createdAt,
      'documentId': doc.id,
    });
  }

  components.add({
    'id': 'root',
    'component': 'DocumentGallery',
    'title': title,
    'children': childIds,
  });

  return _surfaceMessages(surfaceId, components);
}

List<core.A2uiMessage> buildDocumentDetailSurface(
  String surfaceId,
  Document document,
) {
  final components = <Map<String, dynamic>>[
    {
      'id': 'root',
      'component': 'DocumentCard',
      'title': _extractFilename(document.objectKey),
      'thumbnailUrl': document.thumbnailUrl,
      'description': document.description,
      'contentType': document.contentType,
      'createdAt': document.createdAt,
      'documentId': document.id,
    },
  ];

  return _surfaceMessages(surfaceId, components);
}

List<core.A2uiMessage> buildSimilarDocumentsSurface(
  String surfaceId,
  List<SimilarDocument> matches,
) {
  final components = <Map<String, dynamic>>[];
  final childIds = <String>[];

  for (var i = 0; i < matches.length; i++) {
    final match = matches[i];
    final componentId = 'similar-$i';
    childIds.add(componentId);

    final distanceLabel =
        '${(match.distance * 100).toStringAsFixed(1)}% distance';
    final desc = match.description != null
        ? '[$distanceLabel] ${match.description}'
        : distanceLabel;

    components.add({
      'id': componentId,
      'component': 'DocumentCard',
      'title': _extractFilename(match.objectKey),
      'thumbnailUrl': match.thumbnailUrl,
      'description': desc,
      'contentType': match.contentType,
      'createdAt': match.createdAt,
      'documentId': match.id,
    });
  }

  components.add({
    'id': 'root',
    'component': 'DocumentGallery',
    'title': 'Similar Documents',
    'children': childIds,
  });

  return _surfaceMessages(surfaceId, components);
}

List<core.A2uiMessage> buildTextSurface(
  String surfaceId,
  String text, {
  bool isAssistant = true,
}) {
  final components = <Map<String, dynamic>>[
    {
      'id': 'root',
      'component': 'TextMessage',
      'text': text,
      'isAssistant': isAssistant,
    },
  ];

  return _surfaceMessages(surfaceId, components);
}

List<core.A2uiMessage> _surfaceMessages(
  String surfaceId,
  List<Map<String, dynamic>> components,
) {
  return [
    core.CreateSurfaceMessage(surfaceId: surfaceId, catalogId: _catalogId),
    core.UpdateComponentsMessage(surfaceId: surfaceId, components: components),
  ];
}

String _extractFilename(String objectKey) {
  final parts = objectKey.split('/');
  return parts.isNotEmpty ? parts.last : objectKey;
}
