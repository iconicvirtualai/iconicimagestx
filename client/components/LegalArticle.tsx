import LegalContact from "@/components/LegalContact";
import { legalScrollMarginClassName } from "@/components/LegalDocument";
import type { ArticleSection } from "@shared/a2pPages";

export default function LegalArticle({ sections }: { sections: ArticleSection[] }) {
  return (
    <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className={legalScrollMarginClassName}>
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">{section.title}</h2>
          {section.blocks.map((block, index) => {
            if (block.type === "contact") return <LegalContact key={`${section.id}-contact`} />;
            if (block.type === "callout") {
              return (
                <div key={`${section.id}-callout`} className="mt-4 rounded-lg border border-gray-300 bg-gray-50 p-5">
                  <p className="font-semibold text-gray-900">{block.title}</p>
                  <div
                    className="mt-2 space-y-3 [&_a]:text-teal-600 [&_a]:underline [&_ul]:list-disc [&_ul]:list-inside [&_ul]:mt-3 [&_ul]:space-y-2"
                    dangerouslySetInnerHTML={{ __html: block.html }}
                  />
                </div>
              );
            }
            return (
              <div
                key={`${section.id}-${index}`}
                className="space-y-3 [&_a]:text-teal-600 [&_a]:underline [&_ul]:list-disc [&_ul]:list-inside [&_ul]:mt-3 [&_ul]:space-y-2"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
