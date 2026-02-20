import 'package:flutter/material.dart';
import 'package:genui/genui.dart';
import 'package:json_schema_builder/json_schema_builder.dart';

final textMessageItem = CatalogItem(
  name: 'TextMessage',
  dataSchema: S.object(
    properties: {
      'text': S.string(description: 'The message text'),
      'isAssistant': S.boolean(
        description: 'Whether the message is from the assistant',
      ),
    },
    required: ['text'],
  ),
  widgetBuilder: (CatalogItemContext itemContext) {
    final json = itemContext.data as Map<String, Object?>;
    final context = itemContext.buildContext;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final text = json['text'] as String? ?? '';
    final isAssistant = json['isAssistant'] as bool? ?? true;

    final bubbleColor = isAssistant
        ? scheme.surfaceContainerHighest
        : scheme.primaryContainer;
    final textColor = isAssistant
        ? scheme.onSurface
        : scheme.onPrimaryContainer;

    return Align(
      alignment: isAssistant ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isAssistant ? 4 : 16),
            bottomRight: Radius.circular(isAssistant ? 16 : 4),
          ),
          border: Border.all(
            color: isAssistant
                ? scheme.outlineVariant
                : scheme.primary.withValues(alpha: 0.25),
          ),
        ),
        child: Text(
          text,
          style: theme.textTheme.bodyMedium?.copyWith(color: textColor),
        ),
      ),
    );
  },
);
