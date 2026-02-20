package graphs

import (
	"context"
	"fmt"
	"log"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	agenttools "github.com/arcnem-ai/arcnem-vision/models/agents/tools"
	"github.com/tmc/langchaingo/llms"
)

// BuildWorkerNode creates a graph node that runs a ReAct agent, reading from inputKey and writing to outputKey.
func BuildWorkerNode(snapshotNode *SnapshotNode, modelClient any, mcpClient *clients.MCPClient) (*NodeToAdd, error) {
	model, ok := modelClient.(llms.Model)
	if !ok {
		return nil, fmt.Errorf("worker node %q: model client does not implement llms.Model", snapshotNode.Node.NodeKey)
	}
	if mcpClient == nil && len(snapshotNode.Tools) > 0 {
		return nil, fmt.Errorf("worker node %q: mcp client is required when tools are assigned", snapshotNode.Node.NodeKey)
	}

	graphTools := agenttools.DBToolsToLangGraphTools(snapshotNode.Tools, mcpClient)
	maxIterations, opts, err := parseWorkerConfig(snapshotNode)
	if err != nil {
		return nil, err
	}
	inputConfig, err := parseNodeInputConfig(snapshotNode.Node.Config)
	if err != nil {
		return nil, fmt.Errorf("worker node %q: invalid input config json: %w", snapshotNode.Node.NodeKey, err)
	}

	agent, err := buildAgentMap(model, graphTools, maxIterations, opts...)
	if err != nil {
		return nil, fmt.Errorf("worker node %q: failed to create agent: %w", snapshotNode.Node.NodeKey, err)
	}

	inputKey := snapshotNode.Node.InputKey
	outputKey := snapshotNode.Node.OutputKey

	return &NodeToAdd{
		Name:        snapshotNode.Node.NodeKey,
		Description: snapshotNode.Node.NodeKey,
		Fn: func(ctx context.Context, state map[string]any) (map[string]any, error) {
			var input string
			if inputKey != nil {
				input, _ = state[*inputKey].(string)
			}
			log.Printf(
				"graph worker start node=%s max_iterations=%d input_len=%d input_preview=%q",
				snapshotNode.Node.NodeKey,
				maxIterations,
				len(input),
				previewText(input),
			)

			humanMessage, err := buildHumanInputMessage(ctx, input, inputConfig, "Analyze this image and provide a detailed description.")
			if err != nil {
				log.Printf(
					"graph worker input_prepare_error node=%s err=%v",
					snapshotNode.Node.NodeKey,
					err,
				)
				return nil, fmt.Errorf("worker node %q: %w", snapshotNode.Node.NodeKey, err)
			}
			result, err := agent.Invoke(ctx, map[string]any{
				"messages": []llms.MessageContent{humanMessage},
			})
			if err != nil {
				log.Printf(
					"graph worker error node=%s max_iterations=%d err=%v",
					snapshotNode.Node.NodeKey,
					maxIterations,
					err,
				)
				return nil, fmt.Errorf("worker node %q: %w", snapshotNode.Node.NodeKey, err)
			}

			output := extractLastAIMessage(result)
			messageCount := 0
			if messages, ok := result["messages"].([]llms.MessageContent); ok {
				messageCount = len(messages)
			}
			if isMaxIterationsMessage(output) {
				log.Printf(
					"graph worker iteration_limit node=%s max_iterations=%d input_preview=%q output_preview=%q",
					snapshotNode.Node.NodeKey,
					maxIterations,
					previewText(input),
					previewText(output),
				)
				return nil, fmt.Errorf("worker node %q hit max iterations: %s", snapshotNode.Node.NodeKey, output)
			}
			log.Printf(
				"graph worker end node=%s message_count=%d output_len=%d output_preview=%q",
				snapshotNode.Node.NodeKey,
				messageCount,
				len(output),
				previewText(output),
			)

			if outputKey != nil {
				return map[string]any{*outputKey: output}, nil
			}
			return map[string]any{}, nil
		},
	}, nil
}

// BuildSupervisorMemberWorkerNode creates an outer-graph node for a worker that
// participates in a supervisor routing cycle. It communicates through the shared
// "messages" state key (with AppendReducer) rather than inputKey/outputKey.
//
// The node reads accumulated messages from state, invokes the ReAct agent, and
// returns only the newly generated messages (delta) to prevent duplication when
// the AppendReducer merges them back into state.
func BuildSupervisorMemberWorkerNode(snapshotNode *SnapshotNode, modelClient any, mcpClient *clients.MCPClient) (*NodeToAdd, error) {
	model, ok := modelClient.(llms.Model)
	if !ok {
		return nil, fmt.Errorf("member worker %q: model client does not implement llms.Model", snapshotNode.Node.NodeKey)
	}
	if mcpClient == nil && len(snapshotNode.Tools) > 0 {
		return nil, fmt.Errorf("member worker %q: mcp client is required when tools are assigned", snapshotNode.Node.NodeKey)
	}

	graphTools := agenttools.DBToolsToLangGraphTools(snapshotNode.Tools, mcpClient)
	maxIterations, opts, err := parseWorkerConfig(snapshotNode)
	if err != nil {
		return nil, err
	}

	baseAgent, err := buildAgentMap(model, graphTools, maxIterations, opts...)
	if err != nil {
		return nil, fmt.Errorf("member worker %q: failed to create agent: %w", snapshotNode.Node.NodeKey, err)
	}

	nodeKey := snapshotNode.Node.NodeKey

	return &NodeToAdd{
		Name:        nodeKey,
		Description: fmt.Sprintf("Supervisor member worker: %s", nodeKey),
		Fn: func(ctx context.Context, state map[string]any) (map[string]any, error) {
			inputMessages, _ := state["messages"].([]llms.MessageContent)

			log.Printf(
				"graph supervisor_member_start node=%s max_iterations=%d message_count=%d",
				nodeKey, maxIterations, len(inputMessages),
			)

			result, err := baseAgent.Invoke(ctx, map[string]any{
				"messages": inputMessages,
			})
			if err != nil {
				log.Printf(
					"graph supervisor_member_error node=%s err=%v",
					nodeKey, err,
				)
				return nil, fmt.Errorf("member worker %q: %w", nodeKey, err)
			}

			outputMessages, _ := result["messages"].([]llms.MessageContent)
			if len(outputMessages) == 0 {
				log.Printf(
					"graph supervisor_member_end node=%s message_count=0",
					nodeKey,
				)
				return map[string]any{}, nil
			}

			// CreateAgentMap returns full conversation history. Keep only the delta
			// (newly generated messages) to prevent duplication with AppendReducer.
			if len(inputMessages) > 0 && len(outputMessages) >= len(inputMessages) {
				outputMessages = outputMessages[len(inputMessages):]
			}

			if len(outputMessages) == 0 {
				log.Printf(
					"graph supervisor_member_end node=%s message_count=0",
					nodeKey,
				)
				return map[string]any{}, nil
			}

			// Check for max iterations in the last message.
			lastOutput := extractLastAIMessage(result)
			if isMaxIterationsMessage(lastOutput) {
				log.Printf(
					"graph supervisor_member_iteration_limit node=%s max_iterations=%d",
					nodeKey, maxIterations,
				)
				return nil, fmt.Errorf("member worker %q hit max iterations: %s", nodeKey, lastOutput)
			}

			log.Printf(
				"graph supervisor_member_end node=%s message_count=%d",
				nodeKey, len(outputMessages),
			)

			return map[string]any{
				"messages": outputMessages,
			}, nil
		},
	}, nil
}
