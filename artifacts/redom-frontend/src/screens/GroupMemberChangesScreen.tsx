import { useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { groupService } from "../messages/groupService";
import { GroupActionIcon } from "../components/GroupActionIcon";

type Props = NativeStackScreenProps<RootStackParamList, "GroupMemberChanges">;

type MemberChange = {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
};

export function GroupMemberChangesScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [data, setData] = useState<MemberChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void groupService
      .getMemberChanges(route.params.conversationId)
      .then((result) => {
        if (active) setData(result.changes);
      })
      .catch(() => {
        if (active) setData([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [route.params.conversationId]);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <GroupActionIcon kind="back" size={30} color={colors.text} />
        </Pressable>

        <Text style={s.title}>Member changes</Text>

        <View style={s.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator style={s.loading} color="#1877F2" />
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {data.length === 0 ? (
            <Text style={s.empty}>No recorded member changes yet.</Text>
          ) : (
            data.map((change) => (
              <View style={s.row} key={change.id}>
                <GroupActionIcon kind="list" size={28} color="#1877F2" />
                <View style={s.rowContent}>
                  <Text style={s.name}>{change.title || change.type}</Text>
                  {!!change.description && (
                    <Text style={s.desc}>{change.description}</Text>
                  )}
                  <Text style={s.time}>
                    {new Date(change.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      height: 60,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerSpacer: {
      width: 30,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
    },
    loading: {
      marginTop: 40,
    },
    list: {
      paddingBottom: 30,
    },
    row: {
      padding: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      gap: 18,
    },
    rowContent: {
      flex: 1,
    },
    name: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    desc: {
      marginTop: 4,
      color: colors.textSecondary,
    },
    time: {
      marginTop: 5,
      fontSize: 12,
      color: "#98A2B3",
    },
    empty: {
      padding: 24,
      color: colors.textSecondary,
      textAlign: "center",
    },
  });
}
