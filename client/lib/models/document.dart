class Document {
  final String id;
  final String objectKey;
  final String contentType;
  final int sizeBytes;
  final String createdAt;
  final String? description;
  final String? thumbnailUrl;

  const Document({
    required this.id,
    required this.objectKey,
    required this.contentType,
    required this.sizeBytes,
    required this.createdAt,
    this.description,
    this.thumbnailUrl,
  });

  factory Document.fromJson(Map<String, dynamic> json) {
    return Document(
      id: json['id'] as String,
      objectKey: json['objectKey'] as String,
      contentType: json['contentType'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      description: json['description'] as String?,
      thumbnailUrl: json['thumbnailUrl'] as String?,
    );
  }
}

class SimilarDocument {
  final String id;
  final String objectKey;
  final String contentType;
  final int sizeBytes;
  final String createdAt;
  final String? description;
  final String? thumbnailUrl;
  final double distance;

  const SimilarDocument({
    required this.id,
    required this.objectKey,
    required this.contentType,
    required this.sizeBytes,
    required this.createdAt,
    this.description,
    this.thumbnailUrl,
    required this.distance,
  });

  factory SimilarDocument.fromJson(Map<String, dynamic> json) {
    return SimilarDocument(
      id: json['id'] as String,
      objectKey: json['objectKey'] as String,
      contentType: json['contentType'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      description: json['description'] as String?,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      distance: (json['distance'] as num).toDouble(),
    );
  }
}

class DocumentListResponse {
  final List<Document> documents;
  final String? nextCursor;

  const DocumentListResponse({
    required this.documents,
    this.nextCursor,
  });

  factory DocumentListResponse.fromJson(Map<String, dynamic> json) {
    final docs = (json['documents'] as List<dynamic>)
        .map((e) => Document.fromJson(e as Map<String, dynamic>))
        .toList();
    return DocumentListResponse(
      documents: docs,
      nextCursor: json['nextCursor'] as String?,
    );
  }
}
