import 'package:flutter/material.dart';
import 'package:genui/genui.dart';
import 'package:json_schema_builder/json_schema_builder.dart';

final documentGalleryItem = CatalogItem(
  name: 'DocumentGallery',
  dataSchema: S.object(
    properties: {
      'title': S.string(description: 'Gallery section title'),
      'children': S.list(
        items: S.string(description: 'Child component ID'),
        description: 'List of child component IDs to render',
      ),
    },
    required: ['title', 'children'],
  ),
  widgetBuilder: (CatalogItemContext itemContext) {
    final json = itemContext.data as Map<String, Object?>;
    final context = itemContext.buildContext;
    final title = json['title'] as String? ?? '';
    final children =
        (json['children'] as List<Object?>?)?.whereType<String>().toList() ??
        [];

    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (title.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Icon(
                    Icons.grid_view_rounded,
                    size: 18,
                    color: scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Text(title, style: theme.textTheme.titleMedium),
                ],
              ),
            ),
          ...children.map(
            (childId) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: itemContext.buildChild(childId),
            ),
          ),
        ],
      ),
    );
  },
);
