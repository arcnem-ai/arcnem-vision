import 'dart:convert';

import 'package:arcnem_vision_client/services/http_response_utils.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:fpdart/fpdart.dart';
import 'package:http/http.dart' as http;

class AuthService {
  static const String _apiKeyStorageKey = 'api_key';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String get baseURL => dotenv.env['API_URL'] ?? '';
  String get clientOrigin => dotenv.env['CLIENT_ORIGIN'] ?? '';

  TaskEither<String, String> getStoredAPIKey() {
    return TaskEither.tryCatch(
      () async {
        final seedApiKey = _getDebugSeedApiKey();
        if (seedApiKey != null) {
          await _storage.write(key: _apiKeyStorageKey, value: seedApiKey);
          return seedApiKey;
        }

        return await _storage
            .read(key: _apiKeyStorageKey)
            .timeout(const Duration(seconds: 1));
      },
      (error, _) => 'Failed to read API key from storage | error: $error',
    ).flatMap((key) {
      final normalizedKey = key?.trim() ?? '';
      if (normalizedKey.isEmpty) {
        return TaskEither.left('No API key present in storage');
      }
      return TaskEither.of(normalizedKey);
    });
  }

  String? _getDebugSeedApiKey() {
    try {
      final seedApiKey = dotenv.env['DEBUG_SEED_API_KEY']?.trim() ?? '';
      if (seedApiKey.isEmpty) {
        return null;
      }
      return seedApiKey;
    } catch (_) {
      return null;
    }
  }

  TaskEither<String, Unit> clearStoredAPIKey() {
    return TaskEither.tryCatch(() async {
      await _storage
          .delete(key: _apiKeyStorageKey)
          .timeout(const Duration(seconds: 1));
      return unit;
    }, (error, _) => 'Failed to clear API key from storage | error: $error');
  }

  TaskEither<String, Map<String, dynamic>> verifyAPIKey(
    String apiKey, {
    bool persistOnSuccess = true,
  }) {
    final key = apiKey.trim();
    if (key.isEmpty) {
      return TaskEither.left('API key is required');
    }

    return TaskEither.tryCatch(() async {
      return await http.post(
        Uri.parse('$baseURL/api/auth/api-key/verify'),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'Origin': clientOrigin,
        },
        body: jsonEncode({'key': key}),
      );
    }, (error, _) => 'Failed to verify API key | error: $error').flatMap((
      response,
    ) {
      if (response.statusCode != 200) {
        return TaskEither.left(
          extractErrorMessageFromResponse(
            response,
            fallbackMessage:
                'Request failed with status ${response.statusCode}',
          ),
        );
      }

      return TaskEither.fromEither(
        decodeJsonObject(
          response.body,
          emptyBodyMessage: 'Unauthorized',
          invalidJsonMessage: 'Unauthorized',
        ),
      ).flatMap((parsed) {
        final isValid = parsed['valid'] == true;
        if (!isValid) {
          return TaskEither.left('Unauthorized');
        }

        final verifiedKey = parsed['key'];
        final apiKeyId = verifiedKey is Map<String, dynamic>
            ? verifiedKey['id']
            : null;
        final sessionData = <String, dynamic>{
          'valid': true,
          'apiKeyId': apiKeyId,
          'key': verifiedKey,
        };

        if (!persistOnSuccess) {
          return TaskEither.of(sessionData);
        }

        return TaskEither.tryCatch(() async {
          await _storage.write(key: _apiKeyStorageKey, value: key);
          return sessionData;
        }, (error, _) => 'Failed to persist API key | error: $error');
      });
    });
  }

  TaskEither<String, Unit> signOut() {
    return clearStoredAPIKey();
  }

  TaskEither<String, http.Response> makeAuthenticatedRequest({
    required String method,
    required String endpoint,
    Map<String, dynamic>? body,
  }) {
    final uppercaseMethod = method.toUpperCase();
    if (!{'GET', 'POST', 'PUT', 'DELETE'}.contains(uppercaseMethod)) {
      return TaskEither.left('Unsupported HTTP method $uppercaseMethod');
    }

    return getStoredAPIKey().flatMap((key) {
      return TaskEither.tryCatch(() async {
        final headers = {
          'x-api-key': key,
          'Content-Type': 'application/json',
          'Origin': clientOrigin,
        };

        final uri = Uri.parse('$baseURL$endpoint');

        switch (uppercaseMethod) {
          case 'GET':
            return await http.get(uri, headers: headers);
          case 'POST':
            return await http.post(
              uri,
              headers: headers,
              body: body == null ? null : jsonEncode(body),
            );
          case 'PUT':
            return await http.put(
              uri,
              headers: headers,
              body: body == null ? null : jsonEncode(body),
            );
          case 'DELETE':
            return await http.delete(uri, headers: headers);
          default:
            throw Exception('Unsupported HTTP method $uppercaseMethod');
        }
      }, (error, _) => 'Failed to make authenticated request | error: $error');
    });
  }
}
