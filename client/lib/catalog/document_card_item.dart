import 'package:flutter/material.dart';
import 'package:genui/genui.dart';
import 'package:json_schema_builder/json_schema_builder.dart';

final documentCardItem = CatalogItem(
  name: 'DocumentCard',
  dataSchema: S.object(
    properties: {
      'title': S.string(description: 'Document title or filename'),
      'thumbnailUrl': S.string(
        description: 'Presigned URL for the image thumbnail',
      ),
      'description': S.string(
        description: 'LLM-generated description of the document',
      ),
      'contentType': S.string(description: 'MIME type of the document'),
      'createdAt': S.string(description: 'ISO timestamp of document creation'),
      'documentId': S.string(description: 'UUID of the document'),
    },
    required: ['title', 'documentId'],
  ),
  widgetBuilder: (CatalogItemContext itemContext) {
    final json = itemContext.data as Map<String, Object?>;
    final context = itemContext.buildContext;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final title = json['title'] as String? ?? 'Untitled';
    final thumbnailUrl = json['thumbnailUrl'] as String?;
    final description = json['description'] as String?;
    final contentType = json['contentType'] as String?;
    final createdAt = json['createdAt'] as String?;
    final documentId = json['documentId'] as String? ?? '';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (thumbnailUrl != null)
              Stack(
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 210),
                    child: Image.network(
                      thumbnailUrl,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        height: 140,
                        color: scheme.surfaceContainerHighest,
                        alignment: Alignment.center,
                        child: Icon(
                          Icons.image_not_supported_outlined,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                  if (contentType != null)
                    Positioned(
                      top: 12,
                      left: 12,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.58),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          child: Text(
                            contentType,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.titleMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (description != null && description.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (createdAt != null)
                        Text(
                          _formatDate(createdAt),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      const Spacer(),
                      FilledButton.tonalIcon(
                        onPressed: () => itemContext.dispatchEvent(
                          UserActionEvent(
                            name: 'findSimilar',
                            sourceComponentId: itemContext.id,
                            context: {'documentId': documentId},
                          ),
                        ),
                        icon: const Icon(Icons.search_rounded, size: 16),
                        label: const Text('Find Similar'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  },
);

String _formatDate(String isoString) {
  try {
    final dt = DateTime.parse(isoString);
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  } catch (_) {
    return isoString;
  }
}
