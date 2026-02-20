import 'dart:convert';

import 'package:fpdart/fpdart.dart';
import 'package:http/http.dart' as http;

Either<String, Map<String, dynamic>> decodeJsonObject(
  String body, {
  String emptyBodyMessage = 'Response body is empty',
  String invalidJsonMessage = 'Response body is not a valid JSON object',
}) {
  if (body.trim().isEmpty) {
    return Either.left(emptyBodyMessage);
  }

  return Either.tryCatch(
    () => jsonDecode(body),
    (error, _) => '$invalidJsonMessage | error: $error',
  ).flatMap((decoded) {
    if (decoded is Map<String, dynamic>) {
      return Either.right(decoded);
    }
    return Either.left(invalidJsonMessage);
  });
}

String extractErrorMessageFromJson(
  Map<String, dynamic> json, {
  required String fallbackMessage,
}) {
  final topLevelMessage = json['message'];
  if (topLevelMessage is String && topLevelMessage.trim().isNotEmpty) {
    return topLevelMessage;
  }

  final errorNode = json['error'];
  if (errorNode is String && errorNode.trim().isNotEmpty) {
    return errorNode;
  }
  if (errorNode is Map<String, dynamic>) {
    final nestedMessage = errorNode['message'];
    if (nestedMessage is String && nestedMessage.trim().isNotEmpty) {
      return nestedMessage;
    }
  }

  return fallbackMessage;
}

String extractErrorMessageFromResponse(
  http.Response response, {
  required String fallbackMessage,
}) {
  return decodeJsonObject(response.body).fold(
    (_) => fallbackMessage,
    (json) =>
        extractErrorMessageFromJson(json, fallbackMessage: fallbackMessage),
  );
}
