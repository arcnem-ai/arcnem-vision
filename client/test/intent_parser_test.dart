import 'package:arcnem_vision_client/enums/document_intent.dart';
import 'package:arcnem_vision_client/services/intent_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parseIntentFromKeywords extracts a valid UUID for similar intent', () {
    const docId = '019c3cd8-b193-5eb0-a4d9-eb98d302568a';
    final parsed = parseIntentFromKeywords('find similar to $docId please');

    expect(parsed.intent, DocumentIntent.findSimilar);
    expect(parsed.documentId, docId);
  });

  test('parseIntentFromKeywords does not throw on partial UUID-like text', () {
    expect(
      () => parseIntentFromKeywords('find similar 019c3cd8-b193- this one'),
      returnsNormally,
    );
  });
}
