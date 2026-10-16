import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarPlus, FilePlus2, MapPin, NotebookPen, Pencil, UserRound } from "lucide-react";
import { db } from "@/db";
import { members, projects } from "@/db/schema";
import { ActivityFeed, DocumentList, EventList, MeetingList } from "@/components/lists";
import { Badge, Card, PageHeader, TextLink } from "@/components/ui";
import { listActivities, listDocuments, listEvents, listMeetings } from "@/lib/data";
import { PROJECT_CATEGORIES, PROJECT_STATUSES, optionColor, optionLabel } from "@/lib/constants";
import { dDay, formatDate, parseDateKey, todayKey } from "@/lib/dates";
import { memberOptions } from "@/lib/queries";
import { isUuid } from "@/lib/utils";

async function getProject(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ project: projects, ownerName: members.name })
    .from(projects)
    .leftJoin(members, eq(members.id, projects.ownerId))
    .where(eq(projects.id, id))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const row = await getProject(id);
  return { title: row?.project.name ?? "프로젝트" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getProject(id);
  if (!row) notFound();
  const { project: p, ownerName } = row;

  const [docs, upcoming, meetingRows, activity, memberList] = await Promise.all([
    listDocuments({ projectId: p.id, limit: 50 }),
    listEvents({ projectId: p.id, from: parseDateKey(todayKey()), limit: 30 }),
    listMeetings({ projectId: p.id, limit: 30 }),
    listActivities({ projectId: p.id, limit: 15 }),
    memberOptions(),
  ]);

  return (
    <div>
      <div className="mb-2 text-sm text-gray-500">
        <Link href="/projects" className="hover:text-gray-900">
          프로젝트
        </Link>{" "}
        / {p.brand || "브랜드 미지정"}
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
        }
        actions={
          <>
            <Link href={`/documents/new?project=${p.id}`} className="btn-secondary">
              <FilePlus2 className="h-4 w-4" />
              문서 추가
            </Link>
            <Link href={`/schedule?project=${p.id}&new=${todayKey()}`} className="btn-secondary">
              <CalendarPlus className="h-4 w-4" />
              일정 추가
            </Link>
            <Link href={`/meetings/new?project=${p.id}`} className="btn-primary">
              <NotebookPen className="h-4 w-4" />
              회의록 작성
            </Link>
          </>
        }
      />

      <div className="card mb-6 grid gap-4 p-5 md:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge color={optionColor(PROJECT_STATUSES, p.status)}>{optionLabel(PROJECT_STATUSES, p.status)}</Badge>
            <Badge className="bg-gray-100 text-gray-700">{optionLabel(PROJECT_CATEGORIES, p.category)}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{p.description || "프로젝트 개요를 입력해 두면 팀원 모두가 목표를 공유할 수 있습니다."}</p>
        </div>
        <dl className="space-y-2.5 border-t border-gray-100 pt-4 text-sm md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div>
            <dt className="text-xs text-gray-500">운영 기간</dt>
            <dd className="font-medium text-gray-900">
              {p.startDate ? (
                <>
                  {formatDate(p.startDate, { month: "long", day: "numeric", weekday: "short" })}
                  {p.endDate && ` ~ ${formatDate(p.endDate, { month: "long", day: "numeric", weekday: "short" })}`}
                  {p.startDate >= todayKey() && <span className="ml-1.5 text-brand-600">{dDay(p.startDate)}</span>}
                </>
              ) : (
                "미정"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">장소</dt>
            <dd className="flex items-center gap-1 font-medium text-gray-900">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {p.venue || "미정"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">담당 PM</dt>
            <dd className="flex items-center gap-1 font-medium text-gray-900">
              <UserRound className="h-3.5 w-3.5 text-gray-400" />
              {ownerName ?? "미지정"}
            </dd>
          </div>
          <Link href={`/projects/${p.id}/edit`} className="btn-secondary btn-sm mt-1 w-full">
            <Pencil className="h-3.5 w-3.5" />
            프로젝트 수정
          </Link>
        </dl>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="다가오는 일정" action={<TextLink href={`/schedule?project=${p.id}`}>캘린더 보기</TextLink>} bodyClassName="p-2">
          <EventList events={upcoming} members={memberList} showProject={false} />
        </Card>
        <Card title="회의록" action={<TextLink href={`/meetings/new?project=${p.id}`}>+ 새 회의록</TextLink>} bodyClassName="p-2">
          <MeetingList meetings={meetingRows} showProject={false} />
        </Card>
        <Card title={`문서 (${docs.length})`} action={<TextLink href={`/documents?project=${p.id}`}>문서함에서 보기</TextLink>} bodyClassName="p-2">
          <DocumentList docs={docs} showProject={false} />
        </Card>
        <Card title="최근 활동">
          <ActivityFeed items={activity} />
        </Card>
      </div>
    </div>
  );
}
