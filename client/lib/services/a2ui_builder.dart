import 'package:arcnem_vision_client/models/document.dart';
import 'package:genui/genui.dart';

const _catalogId = 'com.arcnem.vision';

List<A2uiMessage> buildDocumentListSurface(
  String surfaceId,
  List<Document> documents,
  String title,
) {
  final components = <Component>[];
  final childIds = <String>[];

  for (var i = 0; i < documents.length; i++) {
    final doc = documents[i];
    final componentId = 'doc-$i';
    childIds.add(componentId);

    components.add(Component.fromJson({
      'id': componentId,
      'component': {
        'DocumentCard': {
          'title': _extractFilename(doc.objectKey),
          'thumbnailUrl': doc.thumbnailUrl,
          'description': doc.description,
          'contentType': doc.contentType,
          'createdAt': doc.createdAt,
          'documentId': doc.id,
        },
      },
    }));
  }

  components.add(Component.fromJson({
    'id': 'root',
    'component': {
      'DocumentGallery': {
        'title': title,
        'children': childIds,
      },
    },
  }));

  return [
    SurfaceUpdate(surfaceId: surfaceId, components: components),
    BeginRendering(surfaceId: surfaceId, root: 'root', catalogId: _catalogId),
  ];
}

List<A2uiMessage> buildDocumentDetailSurface(
  String surfaceId,
  Document document,
) {
  final components = <Component>[];

  components.add(Component.fromJson({
    'id': 'root',
    'component': {
      'DocumentCard': {
        'title': _extractFilename(document.objectKey),
        'thumbnailUrl': document.thumbnailUrl,
        'description': document.description,
        'contentType': document.contentType,
        'createdAt': document.createdAt,
        'documentId': document.id,
      },
    },
  }));

  return [
    SurfaceUpdate(surfaceId: surfaceId, components: components),
    BeginRendering(surfaceId: surfaceId, root: 'root', catalogId: _catalogId),
  ];
}

List<A2uiMessage> buildSimilarDocumentsSurface(
  String surfaceId,
  List<SimilarDocument> matches,
) {
  final components = <Component>[];
  final childIds = <String>[];

  for (var i = 0; i < matches.length; i++) {
    final match = matches[i];
    final componentId = 'similar-$i';
    childIds.add(componentId);

    final distanceLabel = '${(match.distance * 100).toStringAsFixed(1)}% distance';
    final desc = match.description != null
        ? '[$distanceLabel] ${match.description}'
        : distanceLabel;

    components.add(Component.fromJson({
      'id': componentId,
      'component': {
        'DocumentCard': {
          'title': _extractFilename(match.objectKey),
          'thumbnailUrl': match.thumbnailUrl,
          'description': desc,
          'contentType': match.contentType,
          'createdAt': match.createdAt,
          'documentId': match.id,
        },
      },
    }));
  }

  components.add(Component.fromJson({
    'id': 'root',
    'component': {
      'DocumentGallery': {
        'title': 'Similar Documents',
        'children': childIds,
      },
    },
  }));

  return [
    SurfaceUpdate(surfaceId: surfaceId, components: components),
    BeginRendering(surfaceId: surfaceId, root: 'root', catalogId: _catalogId),
  ];
}

List<A2uiMessage> buildTextSurface(
  String surfaceId,
  String text, {
  bool isAssistant = true,
}) {
  final components = <Component>[
    Component.fromJson({
      'id': 'root',
      'component': {
        'TextMessage': {
          'text': text,
          'isAssistant': isAssistant,
        },
      },
    }),
  ];

  return [
    SurfaceUpdate(surfaceId: surfaceId, components: components),
    BeginRendering(surfaceId: surfaceId, root: 'root', catalogId: _catalogId),
  ];
}

String _extractFilename(String objectKey) {
  final parts = objectKey.split('/');
  return parts.isNotEmpty ? parts.last : objectKey;
}
